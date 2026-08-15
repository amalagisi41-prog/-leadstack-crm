import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMock = vi.fn(async () => undefined);
const getMock = vi.fn();

vi.mock("@/lib/auth/require-tenancy", () => ({
  requireSubAccountAdmin: vi.fn(async () => ({
    uid: "operator-1",
    agencyId: "agency-1",
  })),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" },
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    doc: () => ({ update: updateMock }),
    collection: () => ({
      where: () => ({ limit: () => ({ get: getMock }) }),
    }),
  }),
}));

import { PATCH } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/sub-accounts/sub-1/domain", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "sub-1" }) };

/** Firestore query result stub: docs with the given ids. */
function claimedBy(...ids: string[]) {
  return { docs: ids.map((id) => ({ id })) };
}

beforeEach(() => {
  updateMock.mockClear();
  getMock.mockReset();
  getMock.mockResolvedValue(claimedBy());
});

describe("PATCH /api/sub-accounts/[id]/domain", () => {
  it("saves a normalized domain when no other workspace claims it", async () => {
    const res = await PATCH(makeRequest({ domain: "https://www.Example.com/path" }), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ domain: "example.com" });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ customDomain: "example.com" }),
    );
  });

  it("rejects a domain already connected to a different workspace", async () => {
    getMock.mockResolvedValue(claimedBy("sub-2"));
    const res = await PATCH(makeRequest({ domain: "example.com" }), ctx);
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows re-saving a domain this same workspace already owns", async () => {
    getMock.mockResolvedValue(claimedBy("sub-1"));
    const res = await PATCH(makeRequest({ domain: "example.com" }), ctx);
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it("clears the domain without running a uniqueness check", async () => {
    const res = await PATCH(makeRequest({ domain: null }), ctx);
    expect(res.status).toBe(200);
    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ customDomain: null }),
    );
  });

  it("rejects a malformed domain", async () => {
    const res = await PATCH(makeRequest({ domain: "not a domain" }), ctx);
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
