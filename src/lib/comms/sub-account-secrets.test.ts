import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * THE EXPOSURE THIS FILE EXISTS FOR
 * ---------------------------------
 * `subAccounts/{id}` is readable by every ACTIVE member of the sub-account,
 * down to the `collaborator` role, and Firestore has no field-level read rules.
 * A credential stored on that document is readable by anyone who can read the
 * document at all — and none of these are short-lived:
 *
 *   - a Meta Page access token posts as the business and reads its DMs
 *   - a GoHighLevel token reads the operator's entire other CRM
 *   - an IDX Broker key is the MLS feed credential their brokerage vouched for
 *
 * The tests below hold the three properties that make the fix real rather than
 * cosmetic: the credential is written ONLY to the server-only subcollection,
 * the inline copy on an existing document is DELETED on first read, and
 * disconnecting removes the secret rather than orphaning it.
 */

const docs = new Map<string, Record<string, unknown>>();
const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
const deletes: string[] = [];

const DELETE_SENTINEL = { __delete: true };

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "SERVER_TS",
    delete: () => DELETE_SENTINEL,
  },
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    doc: (path: string) => ({
      get: async () => ({
        exists: docs.has(path),
        data: () => docs.get(path),
      }),
      set: async (data: Record<string, unknown>) => {
        docs.set(path, { ...(docs.get(path) ?? {}), ...data });
      },
      update: async (data: Record<string, unknown>) => {
        updates.push({ path, data });
        // Apply dotted-path deletes so a later read sees the stripped shape.
        const current = { ...(docs.get(path) ?? {}) };
        for (const [key, value] of Object.entries(data)) {
          if (!key.includes(".")) {
            current[key] = value;
            continue;
          }
          const [parent, child] = key.split(".");
          const nested = { ...((current[parent] as object) ?? {}) } as Record<
            string,
            unknown
          >;
          if (value === DELETE_SENTINEL) delete nested[child];
          else nested[child] = value;
          current[parent] = nested;
        }
        docs.set(path, current);
      },
      delete: async () => {
        deletes.push(path);
        docs.delete(path);
      },
    }),
  }),
}));

import {
  deleteIdxSecrets,
  deleteMetaSecrets,
  loadGhlImportSecrets,
  loadIdxSecrets,
  loadMetaSecrets,
  writeMetaSecrets,
} from "./sub-account-secrets";

const PARENT = "subAccounts/sub-1";
const META_SECRET_PATH = "subAccounts/sub-1/secrets/meta";
const GHL_SECRET_PATH = "subAccounts/sub-1/secrets/ghlImport";
const IDX_SECRET_PATH = "subAccounts/sub-1/secrets/idx";

beforeEach(() => {
  docs.clear();
  updates.length = 0;
  deletes.length = 0;
});

describe("secrets live off the member-readable document", () => {
  it("writes a Meta token only to the secrets subcollection", async () => {
    docs.set(PARENT, { metaConfig: { connected: true, pageId: "page-1" } });

    await writeMetaSecrets("sub-1", { pageAccessToken: "EAAG-live-token" });

    expect(docs.get(META_SECRET_PATH)).toMatchObject({
      pageAccessToken: "EAAG-live-token",
    });
    // The parent document must not have gained the token as a side effect.
    expect(JSON.stringify(docs.get(PARENT))).not.toContain("EAAG-live-token");
  });

  it("reads back what it wrote without touching the parent", async () => {
    docs.set(META_SECRET_PATH, { pageAccessToken: "EAAG-live-token" });

    await expect(loadMetaSecrets("sub-1")).resolves.toEqual({
      pageAccessToken: "EAAG-live-token",
    });
    expect(updates).toHaveLength(0);
  });
});

describe("lazy migration closes the exposure without a backfill", () => {
  it("moves an inline Meta token and DELETES the readable copy", async () => {
    // A connection made before this change: token inline on the parent.
    docs.set(PARENT, {
      metaConfig: { connected: true, pageId: "page-1", pageAccessToken: "old" },
    });

    await expect(loadMetaSecrets("sub-1")).resolves.toEqual({
      pageAccessToken: "old",
    });

    expect(docs.get(META_SECRET_PATH)).toMatchObject({
      pageAccessToken: "old",
    });
    // Copying without deleting would leave the credential exactly as exposed
    // as it was — the move is the fix, not the copy.
    const parent = docs.get(PARENT) as { metaConfig: Record<string, unknown> };
    expect(parent.metaConfig).not.toHaveProperty("pageAccessToken");
    expect(parent.metaConfig.pageId).toBe("page-1");
  });

  it("writes the secret before stripping the inline copy", async () => {
    docs.set(PARENT, { metaConfig: { pageAccessToken: "old" } });
    let secretWrittenFirst = false;

    const originalSet = docs.set.bind(docs);
    docs.set = ((path: string, value: Record<string, unknown>) => {
      if (path === META_SECRET_PATH && updates.length === 0) {
        secretWrittenFirst = true;
      }
      return originalSet(path, value);
    }) as typeof docs.set;

    await loadMetaSecrets("sub-1");
    docs.set = originalSet;

    // Deleting first would destroy the credential outright if the process died
    // between the two writes; the operator would have to re-consent at Meta.
    expect(secretWrittenFirst).toBe(true);
  });

  it("migrates a GoHighLevel token pair and stamps the public marker", async () => {
    docs.set(PARENT, {
      ghlImportConfig: {
        token: "pit-abc",
        refreshToken: "refresh-abc",
        locationId: "loc-1",
      },
    });

    await expect(loadGhlImportSecrets("sub-1")).resolves.toEqual({
      token: "pit-abc",
      refreshToken: "refresh-abc",
    });

    const parent = docs.get(PARENT) as {
      ghlImportConfig: Record<string, unknown>;
    };
    expect(parent.ghlImportConfig).not.toHaveProperty("token");
    expect(parent.ghlImportConfig).not.toHaveProperty("refreshToken");
    // The settings UI decided "connected" by testing for the token itself.
    // Without this marker the migration would show a working import as
    // disconnected, which reads as data loss to the operator.
    expect(parent.ghlImportConfig.connected).toBe(true);
    expect(parent.ghlImportConfig.locationId).toBe("loc-1");
  });

  it("migrates an IDX access key and stamps the public marker", async () => {
    docs.set(PARENT, {
      idxConfig: { enabled: true, accessKey: "idx-key", mlsId: "mls-1" },
    });

    await expect(loadIdxSecrets("sub-1")).resolves.toEqual({
      accessKey: "idx-key",
    });

    const parent = docs.get(PARENT) as { idxConfig: Record<string, unknown> };
    expect(parent.idxConfig).not.toHaveProperty("accessKey");
    expect(parent.idxConfig.connected).toBe(true);
    expect(parent.idxConfig.mlsId).toBe("mls-1");
  });

  it("is a one-time move — a second read does not re-write the parent", async () => {
    docs.set(PARENT, { metaConfig: { pageAccessToken: "old" } });

    await loadMetaSecrets("sub-1");
    const updatesAfterFirst = updates.length;
    await loadMetaSecrets("sub-1");

    expect(updates.length).toBe(updatesAfterFirst);
  });

  it("returns null for a sub-account that never connected", async () => {
    docs.set(PARENT, { name: "Acme" });

    await expect(loadMetaSecrets("sub-1")).resolves.toBeNull();
    await expect(loadGhlImportSecrets("sub-1")).resolves.toBeNull();
    await expect(loadIdxSecrets("sub-1")).resolves.toBeNull();
    expect(updates).toHaveLength(0);
  });

  it("ignores an empty-string credential rather than migrating it", async () => {
    // A blank token is not a connection; migrating it would stamp
    // `connected: true` on a workspace that cannot call anything.
    docs.set(PARENT, { idxConfig: { enabled: true, accessKey: "" } });

    await expect(loadIdxSecrets("sub-1")).resolves.toBeNull();
    expect(updates).toHaveLength(0);
  });
});

describe("disconnecting removes the credential", () => {
  it("deletes the Meta secret so it cannot outlive the connection", async () => {
    docs.set(META_SECRET_PATH, { pageAccessToken: "old" });

    await deleteMetaSecrets("sub-1");

    expect(deletes).toContain(META_SECRET_PATH);
    expect(docs.has(META_SECRET_PATH)).toBe(false);
  });

  it("deletes the IDX secret", async () => {
    docs.set(IDX_SECRET_PATH, { accessKey: "idx-key" });

    await deleteIdxSecrets("sub-1");

    expect(docs.has(IDX_SECRET_PATH)).toBe(false);
  });
});

describe("the secret paths are the ones firestore.rules denies", () => {
  it("uses subAccounts/{id}/secrets/{name}", async () => {
    // firestore.rules has `match /secrets/{secretId} { allow read, write: if
    // false; }` under subAccounts. A credential written one path segment away
    // from that match would inherit the PARENT's member-read rule instead —
    // the whole exposure this change removes, silently reintroduced.
    docs.set(PARENT, {
      metaConfig: { pageAccessToken: "m" },
      ghlImportConfig: { token: "g" },
      idxConfig: { enabled: true, accessKey: "i" },
    });

    await loadMetaSecrets("sub-1");
    await loadGhlImportSecrets("sub-1");
    await loadIdxSecrets("sub-1");

    expect(docs.has(META_SECRET_PATH)).toBe(true);
    expect(docs.has(GHL_SECRET_PATH)).toBe(true);
    expect(docs.has(IDX_SECRET_PATH)).toBe(true);
  });
});
