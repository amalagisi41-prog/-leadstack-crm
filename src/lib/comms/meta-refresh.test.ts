import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * refreshMetaConnection is the weekly-cron renewal that keeps a sub-account's
 * Facebook/Instagram connection alive without the operator re-signing in.
 * These tests hold the property that matters: a failure NEVER throws and
 * ALWAYS leaves an honest trail — either a successful refresh timestamp or an
 * explicit `needsReconnect` flag — never a silent no-op that looks the same
 * as success.
 */

const docs = new Map<string, Record<string, unknown>>();
const updates: Array<{ path: string; data: Record<string, unknown> }> = [];

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
      update: async (data: Record<string, unknown>) => {
        updates.push({ path, data });
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
    }),
  }),
}));

const exchangeForLongLivedUserToken = vi.fn();
const listMetaPages = vi.fn();
vi.mock("@/lib/comms/meta", () => ({
  exchangeForLongLivedUserToken: (...args: unknown[]) =>
    exchangeForLongLivedUserToken(...args),
  listMetaPages: (...args: unknown[]) => listMetaPages(...args),
}));

const loadMetaSecrets = vi.fn();
const writeMetaSecrets = vi.fn();
vi.mock("@/lib/comms/sub-account-secrets", () => ({
  loadMetaSecrets: (...args: unknown[]) => loadMetaSecrets(...args),
  writeMetaSecrets: (...args: unknown[]) => writeMetaSecrets(...args),
}));

import { refreshMetaConnection } from "./meta-refresh";

const PARENT = "subAccounts/sub-1";

beforeEach(() => {
  docs.clear();
  updates.length = 0;
  exchangeForLongLivedUserToken.mockReset();
  listMetaPages.mockReset();
  loadMetaSecrets.mockReset();
  writeMetaSecrets.mockReset();
});

describe("refreshMetaConnection", () => {
  it("skips a sub-account with no live connection", async () => {
    docs.set(PARENT, { metaConfig: { connected: false } });
    await expect(refreshMetaConnection("sub-1")).resolves.toEqual({
      ok: false,
      reason: "not_connected",
    });
    expect(loadMetaSecrets).not.toHaveBeenCalled();
  });

  it("reports a legacy connection with no stored user token, without flagging needsReconnect", async () => {
    docs.set(PARENT, {
      metaConfig: { connected: true, pageId: "page-1" },
    });
    loadMetaSecrets.mockResolvedValue({ pageAccessToken: "old-page-token" });

    const result = await refreshMetaConnection("sub-1");
    expect(result).toEqual({ ok: false, reason: "no_stored_user_token" });
    // A legacy connection isn't broken — it just can't self-refresh yet — so
    // this must NOT alarm the operator with a needsReconnect flag.
    expect(docs.get(PARENT)?.metaConfig).not.toHaveProperty("needsReconnect");
  });

  it("re-exchanges the stored user token and re-derives the Page token on success", async () => {
    docs.set(PARENT, {
      metaConfig: { connected: true, pageId: "page-1", needsReconnect: true },
    });
    loadMetaSecrets.mockResolvedValue({
      pageAccessToken: "old-page-token",
      userAccessToken: "old-user-token",
    });
    exchangeForLongLivedUserToken.mockResolvedValue({
      accessToken: "fresh-user-token",
      expiresInSeconds: 5183944,
    });
    listMetaPages.mockResolvedValue([
      { id: "page-1", name: "Test Page", accessToken: "fresh-page-token" },
    ]);

    const result = await refreshMetaConnection("sub-1");

    expect(result).toEqual({ ok: true, reason: "refreshed" });
    expect(exchangeForLongLivedUserToken).toHaveBeenCalledWith(
      "old-user-token",
    );
    expect(writeMetaSecrets).toHaveBeenCalledWith("sub-1", {
      pageAccessToken: "fresh-page-token",
      userAccessToken: "fresh-user-token",
      userTokenObtainedAt: expect.any(Number),
    });
    // A prior needsReconnect flag clears on a successful refresh.
    expect(docs.get(PARENT)?.metaConfig).not.toHaveProperty("needsReconnect");
    expect(docs.get(PARENT)?.metaConfig).toHaveProperty(
      "tokenRefreshedAt",
      "SERVER_TS",
    );
  });

  it("flags needsReconnect when the connected Page is no longer reachable", async () => {
    docs.set(PARENT, {
      metaConfig: { connected: true, pageId: "page-1" },
    });
    loadMetaSecrets.mockResolvedValue({
      pageAccessToken: "old-page-token",
      userAccessToken: "old-user-token",
    });
    exchangeForLongLivedUserToken.mockResolvedValue({
      accessToken: "fresh-user-token",
      expiresInSeconds: 5183944,
    });
    listMetaPages.mockResolvedValue([]); // page-1 no longer in the list

    const result = await refreshMetaConnection("sub-1");

    expect(result).toEqual({ ok: false, reason: "page_not_found" });
    expect(docs.get(PARENT)?.metaConfig).toHaveProperty(
      "needsReconnect",
      true,
    );
    expect(writeMetaSecrets).not.toHaveBeenCalled();
  });

  it("flags needsReconnect and never throws when the re-exchange itself fails", async () => {
    docs.set(PARENT, {
      metaConfig: { connected: true, pageId: "page-1" },
    });
    loadMetaSecrets.mockResolvedValue({
      pageAccessToken: "old-page-token",
      userAccessToken: "revoked-user-token",
    });
    exchangeForLongLivedUserToken.mockRejectedValue(
      new Error("Meta long-lived token exchange failed (400)"),
    );

    const result = await refreshMetaConnection("sub-1");

    expect(result).toEqual({ ok: false, reason: "refresh_error" });
    expect(docs.get(PARENT)?.metaConfig).toHaveProperty(
      "needsReconnect",
      true,
    );
  });
});
