import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-tenancy", () => ({
  requireSubAccountAdmin: vi.fn(async () => ({
    uid: "operator-1",
    agencyId: "agency-1",
  })),
}));

const DELETE = Symbol("DELETE");
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: () => DELETE,
    serverTimestamp: () => "SERVER_TIMESTAMP",
  },
}));

let stored: Record<string, unknown> | null = null;
const batchSet = vi.fn();
const batchCommit = vi.fn(async () => undefined);
const revisionDoc = { path: "businessProfile/main/revisions/rev-1" };
const mainRef = {
  path: "businessProfile/main",
  get: vi.fn(async () => ({
    exists: stored !== null,
    data: () => stored,
  })),
  collection: vi.fn(() => ({ doc: () => revisionDoc })),
};

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    doc: () => mainRef,
    batch: () => ({ set: batchSet, commit: batchCommit }),
  }),
}));

import { DELETE as RESET, GET, PATCH } from "./route";

const ctx = { params: Promise.resolve({ id: "sub-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  stored = null;
});

describe("business-profile persistence", () => {
  it("does not refill the importer from a legacy source URL", async () => {
    stored = {
      agentName: "Seamus Costigan",
      website: "https://seamuscostigan.com",
      importSourceUrl: "https://www.zillow.com/profile/Seamus%20Costigan",
    };

    const response = await GET(new Request("http://localhost"), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.website).toBe("https://seamuscostigan.com");
    expect(body.importSourceUrl).toBe("");
  });

  it("clears a directory URL left in the permanent website field by an old import", async () => {
    stored = {
      agentName: "Seamus Costigan",
      website: "https://www.zillow.com/profile/Seamus%20Costigan",
    };

    const response = await GET(new Request("http://localhost"), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.website).toBe("");
  });

  it("backs up the approved profile and removes the legacy import source on save", async () => {
    stored = {
      agentName: "Seamus Costigan",
      website: "https://seamuscostigan.com",
      importSourceUrl: "https://www.zillow.com/profile/Seamus%20Costigan",
      completeness: 100,
    };
    const request = new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentName: "Seamus Costigan",
        website: "https://seamuscostigan.com",
      }),
    });

    const response = await PATCH(request, ctx);

    expect(response.status).toBe(200);
    expect(batchSet).toHaveBeenCalledWith(
      revisionDoc,
      expect.objectContaining({
        agentName: "Seamus Costigan",
        completeness: 100,
        reason: "before_explicit_save",
      })
    );
    expect(batchSet).toHaveBeenCalledWith(
      mainRef,
      expect.objectContaining({
        agentName: "Seamus Costigan",
        website: "https://seamuscostigan.com",
        importSourceUrl: DELETE,
        importReviewed: true,
      }),
      { merge: true }
    );
    expect(batchCommit).toHaveBeenCalledOnce();
  });

  it("archives the current Blueprint and replaces it with a clean slate", async () => {
    stored = {
      agentName: "Seamus Costigan",
      brokerage: "Marr Caruso Realty Group",
      website: "https://www.zillow.com/profile/Seamus%20Costigan",
      importSourceUrl: "https://www.zillow.com/profile/Seamus%20Costigan",
      completeness: 75,
    };

    const response = await RESET(
      new Request("http://localhost", { method: "DELETE" }),
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.completeness).toBe(0);
    expect(body.profile.agentName).toBe("");
    expect(body.importSourceUrl).toBe("");
    expect(batchSet).toHaveBeenCalledWith(
      revisionDoc,
      expect.objectContaining({
        agentName: "Seamus Costigan",
        completeness: 75,
        reason: "operator_clean_slate_reset",
      })
    );
    expect(batchSet).toHaveBeenCalledWith(
      mainRef,
      expect.objectContaining({
        agentName: "",
        brokerage: "",
        website: "",
        completeness: 0,
        importReviewed: true,
      })
    );
    expect(batchCommit).toHaveBeenCalledOnce();
  });
});
