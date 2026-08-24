import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMock = vi.fn(async () => undefined);
const getMock = vi.fn();
const docGetMock = vi.fn(async () => ({ data: () => ({}) }));
const addDomainMock = vi.fn<
  (domain: string) => Promise<
    { ok: true; status: "added" | "already_added" } | { ok: false; status: "error"; message: string }
  >
>(async () => ({ ok: true, status: "added" }));
const removeDomainMock = vi.fn(async (_domain: string) => undefined);

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
    doc: () => ({ update: updateMock, get: docGetMock }),
    collection: () => ({
      where: () => ({ limit: () => ({ get: getMock }) }),
    }),
  }),
}));

vi.mock("@/lib/domains/vercel-api", () => ({
  addDomainToVercelProject: (domain: string) => addDomainMock(domain),
  removeDomainFromVercelProject: (domain: string) => removeDomainMock(domain),
  vercelApiConfigured: () => vercelConfigured,
}));

let vercelConfigured = false;

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
  docGetMock.mockReset();
  docGetMock.mockResolvedValue({ data: () => ({}) });
  addDomainMock.mockClear();
  addDomainMock.mockResolvedValue({ ok: true, status: "added" });
  removeDomainMock.mockClear();
  vercelConfigured = false;
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

  it("does not attempt Vercel registration when the deployment isn't configured for it", async () => {
    const res = await PATCH(makeRequest({ domain: "example.com" }), ctx);
    await expect(res.json()).resolves.toMatchObject({
      vercel: { attempted: false, ok: true, message: null },
    });
    expect(addDomainMock).not.toHaveBeenCalled();
  });

  it("registers the domain on Vercel when configured, and reports success", async () => {
    vercelConfigured = true;
    const res = await PATCH(makeRequest({ domain: "example.com" }), ctx);
    expect(addDomainMock).toHaveBeenCalledWith("example.com");
    await expect(res.json()).resolves.toMatchObject({
      vercel: { attempted: true, ok: true, message: null },
    });
  });

  it("still saves the domain even when Vercel registration fails", async () => {
    vercelConfigured = true;
    addDomainMock.mockResolvedValue({
      ok: false,
      status: "error",
      message: "Forbidden — bad token",
    });
    const res = await PATCH(makeRequest({ domain: "example.com" }), ctx);
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ customDomain: "example.com" }),
    );
    await expect(res.json()).resolves.toMatchObject({
      vercel: {
        attempted: true,
        ok: false,
        message: "Forbidden — bad token",
      },
    });
  });

  it("best-effort deregisters the prior domain from Vercel on clear", async () => {
    vercelConfigured = true;
    docGetMock.mockResolvedValue({ data: () => ({ customDomain: "old.example.com" }) });
    await PATCH(makeRequest({ domain: null }), ctx);
    expect(removeDomainMock).toHaveBeenCalledWith("old.example.com");
  });

  it("does not touch Vercel on clear when there was no prior domain", async () => {
    vercelConfigured = true;
    docGetMock.mockResolvedValue({ data: () => ({}) });
    await PATCH(makeRequest({ domain: null }), ctx);
    expect(removeDomainMock).not.toHaveBeenCalled();
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
