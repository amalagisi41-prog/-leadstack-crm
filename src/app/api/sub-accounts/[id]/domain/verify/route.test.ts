import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The bug this file exists for: DNS pointing at Vercel's shared edge network
 * is NOT the same as Vercel routing that specific hostname to THIS project.
 * Before the Vercel API integration, a DNS match alone was reported as
 * "live" — which meant an agent could do everything right and still get
 * Vercel's own "Domain not configured" page in production. These tests pin
 * down that a "live" verdict now requires Vercel's own confirmation when
 * this deployment can check, and that the deployment says so plainly when
 * it can't.
 */

const updateMock = vi.fn(async () => undefined);
const docGetMock = vi.fn();
const resolve4Mock = vi.fn();
const resolveCnameMock = vi.fn();

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
    doc: () => ({ get: docGetMock, update: updateMock }),
  }),
}));

vi.mock("@/lib/domains/app-hosts", () => ({
  appHost: () => "app.example.com",
  normalizeHost: (v: string | null | undefined) =>
    (v ?? "").trim().toLowerCase().split(":")[0],
}));

vi.mock("node:dns/promises", () => ({
  Resolver: class {
    setServers = vi.fn();
    resolve4 = resolve4Mock;
    resolveCname = resolveCnameMock;
  },
}));

const addDomainMock = vi.fn(async (_domain: string) => ({ ok: true, status: "added" }));
const getStatusMock = vi.fn((_domain: string) =>
  Promise.resolve<{ attached: boolean; verified: boolean } | null>(null)
);
let vercelConfigured = false;

vi.mock("@/lib/domains/vercel-api", () => ({
  addDomainToVercelProject: (domain: string) => addDomainMock(domain),
  getVercelDomainStatus: (domain: string) => getStatusMock(domain),
  vercelApiConfigured: () => vercelConfigured,
}));

import { POST } from "./route";

function makeRequest(): Request {
  return new Request("http://localhost/api/sub-accounts/sub-1/domain/verify", {
    method: "POST",
  });
}

const ctx = { params: Promise.resolve({ id: "sub-1" }) };

/** DNS state where the domain's records genuinely point at this deployment. */
function dnsPointsHere() {
  resolve4Mock.mockImplementation(async (host: string) =>
    host === "example.com" || host === "app.example.com" ? ["1.2.3.4"] : []
  );
  resolveCnameMock.mockResolvedValue([]);
}

beforeEach(() => {
  updateMock.mockClear();
  docGetMock.mockReset();
  docGetMock.mockResolvedValue({ data: () => ({ customDomain: "example.com" }) });
  resolve4Mock.mockReset();
  resolveCnameMock.mockReset();
  resolve4Mock.mockResolvedValue([]);
  resolveCnameMock.mockResolvedValue([]);
  addDomainMock.mockClear();
  addDomainMock.mockResolvedValue({ ok: true, status: "added" });
  getStatusMock.mockReset();
  vercelConfigured = false;
});

describe("POST /api/sub-accounts/[id]/domain/verify — Vercel-unconfigured deployments", () => {
  it("reports DNS-only 'live' with an honest caveat rather than a bare success", async () => {
    dnsPointsHere();
    const res = await POST(makeRequest(), ctx);
    const body = await res.json();
    expect(body.state).toBe("live");
    expect(body.platformConfigured).toBe(false);
    expect(body.detail).toMatch(/doesn't have Vercel API access configured/i);
    expect(body.detail).toMatch(/add example\.com in your vercel project/i);
    expect(getStatusMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/sub-accounts/[id]/domain/verify — Vercel-configured deployments", () => {
  it("only reports 'live' once Vercel confirms the domain is attached and verified", async () => {
    vercelConfigured = true;
    dnsPointsHere();
    getStatusMock.mockResolvedValue({ attached: true, verified: true });
    const res = await POST(makeRequest(), ctx);
    const body = await res.json();
    expect(body.state).toBe("live");
    expect(body.detail).toMatch(/registered with vercel/i);
  });

  it("downgrades to 'unknown' — never a false 'live' — when Vercel hasn't verified yet", async () => {
    vercelConfigured = true;
    dnsPointsHere();
    getStatusMock.mockResolvedValue({ attached: true, verified: false });
    const res = await POST(makeRequest(), ctx);
    const body = await res.json();
    expect(body.state).toBe("unknown");
    expect(body.detail).toMatch(/hasn't finished verifying/i);
  });

  it("self-heals by registering the domain when DNS is right but Vercel never got it", async () => {
    vercelConfigured = true;
    dnsPointsHere();
    // First check: not attached. After the self-heal attempt, still not
    // attached (e.g. a real conflict) — the important thing is we TRIED.
    getStatusMock
      .mockResolvedValueOnce({ attached: false, verified: false })
      .mockResolvedValueOnce({ attached: false, verified: false });
    const res = await POST(makeRequest(), ctx);
    const body = await res.json();
    expect(addDomainMock).toHaveBeenCalledWith("example.com");
    expect(body.state).toBe("unknown");
    expect(body.detail).toMatch(/couldn't register it on your vercel project/i);
  });

  it("reports success after a self-heal that succeeds", async () => {
    vercelConfigured = true;
    dnsPointsHere();
    getStatusMock
      .mockResolvedValueOnce({ attached: false, verified: false })
      .mockResolvedValueOnce({ attached: true, verified: true });
    const res = await POST(makeRequest(), ctx);
    const body = await res.json();
    expect(body.state).toBe("live");
    expect(body.detail).toMatch(/registered with vercel/i);
  });

  it("never calls the Vercel API when DNS itself is wrong", async () => {
    vercelConfigured = true;
    resolve4Mock.mockResolvedValue([]);
    resolveCnameMock.mockResolvedValue([]);
    const res = await POST(makeRequest(), ctx);
    const body = await res.json();
    expect(body.state).toBe("no_records");
    expect(getStatusMock).not.toHaveBeenCalled();
    expect(addDomainMock).not.toHaveBeenCalled();
  });
});
