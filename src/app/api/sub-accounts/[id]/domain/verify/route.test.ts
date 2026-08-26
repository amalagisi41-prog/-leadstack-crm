import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.fn(async () => undefined);
const docGetMock = vi.fn();
const resolve4Mock = vi.fn();
const resolveCnameMock = vi.fn();

vi.mock("@/lib/auth/require-tenancy", () => ({
  requireSubAccountAdmin: vi.fn(async () => ({ uid: "operator-1", agencyId: "agency-1" })),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" },
}));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({ doc: () => ({ get: docGetMock, update: updateMock }) }),
}));
vi.mock("@/lib/domains/app-hosts", () => ({
  normalizeHost: (value: string | null | undefined) =>
    (value ?? "").trim().toLowerCase().split(":")[0],
}));
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    setServers = vi.fn();
    resolve4 = resolve4Mock;
    resolveCname = resolveCnameMock;
  },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "sub-1" }) };
const request = () => new Request("http://localhost/api/sub-accounts/sub-1/domain/verify", { method: "POST" });

beforeEach(() => {
  updateMock.mockClear();
  docGetMock.mockResolvedValue({ data: () => ({ customDomain: "example.com" }) });
  resolve4Mock.mockResolvedValue([]);
  resolveCnameMock.mockResolvedValue([]);
});

describe("POST /api/sub-accounts/[id]/domain/verify", () => {
  it("treats any public A or CNAME record as a verified external-host setup", async () => {
    resolve4Mock.mockResolvedValue(["1.2.3.4"]);
    const body = await (await POST(request(), ctx)).json();
    expect(body.state).toBe("live");
    expect(body.detail).toMatch(/no DNS change is needed in AgentStack/i);
    expect(body.detail).toMatch(/continue with your business setup/i);
  });

  it("reports no records without giving an AgentStack DNS target", async () => {
    const body = await (await POST(request(), ctx)).json();
    expect(body.state).toBe("no_records");
    expect(body.detail).not.toMatch(/agentstackcrm\.app|vercel/i);
  });

  it("does not call a hosting or DNS cutover service", async () => {
    resolveCnameMock.mockResolvedValue(["www.example-host.com"]);
    const body = await (await POST(request(), ctx)).json();
    expect(body.state).toBe("live");
    expect(body.platformConfigured).toBeUndefined();
  });
});
