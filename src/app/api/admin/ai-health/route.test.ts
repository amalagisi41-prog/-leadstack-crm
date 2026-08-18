import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: (req: Request) => requireAdminMock(req),
}));

vi.mock("@/lib/firecrawl/client", () => ({
  firecrawlIsConfigured: () => true,
}));

import { GET } from "./route";

/**
 * What the deployed runtime actually sees.
 *
 * A day went into inferring this. AI stopped across every workspace at once,
 * while the provider dashboard showed credit available, no key ever used and
 * nothing ever billed — three things that cannot all be true of the key the
 * app is really sending. The stored value is write-only and the provider will
 * not show a key twice, so the only remaining move was rotating a production
 * credential to find out. This endpoint asks instead.
 */

function makeRequest(): Request {
  return new Request("http://localhost/api/admin/ai-health", {
    headers: { "x-user-uid": "admin-1" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

function providerReplies(key: unknown, credits: unknown) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(String(url).includes("/key") ? key : credits), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
  );
}

beforeEach(() => {
  requireAdminMock.mockResolvedValue({ uid: "admin-1", email: "a@b.c" });
  process.env.OPENROUTER_API_KEY = "sk-or-v1-aa6000000000000000000004c2";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete process.env.OPENROUTER_API_KEY;
});

describe("who may ask", () => {
  it("refuses anyone who is not a platform admin", async () => {
    const { NextResponse } = await import("next/server");
    requireAdminMock.mockResolvedValue(
      NextResponse.json({ error: "Admin only" }, { status: 403 })
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("what it reports", () => {
  it("never returns the key, only enough to match a dashboard row", async () => {
    providerReplies(
      { data: { label: "AgentStack Production", usage: 0, limit: null } },
      { data: { total_credits: 10, total_usage: 0 } }
    );

    const res = await GET(makeRequest());
    const body = await res.json();
    const serialised = JSON.stringify(body);

    expect(serialised).not.toContain(process.env.OPENROUTER_API_KEY);
    expect(body.environment.keyFingerprint).toMatch(/^sk-or-v1-aa6…04c2$/);
    expect(body.environment.openRouterKeySet).toBe(true);
  });

  it("says plainly when no key is configured at all", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.environment.openRouterKeySet).toBe(false);
    expect(body.verdict).toMatch(/not set on this deployment/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags a value damaged on paste", async () => {
    // A trailing newline or a wrapping quote fails like an outage and is
    // invisible in the hosting UI.
    process.env.OPENROUTER_API_KEY = '"sk-or-v1-abc123"';
    providerReplies({ data: {} }, { data: {} });
    const body = await (await GET(makeRequest())).json();
    expect(body.environment.keyLooksMalformed).toBe(true);
  });

  it("blames the key, not the balance, when the provider rejects it", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "No auth" } }), {
        status: 401,
      })
    );
    const body = await (await GET(makeRequest())).json();
    expect(body.verdict).toMatch(/deleted, revoked, or the stored value is wrong/i);
    expect(body.verdict).not.toMatch(/credit/i);
  });

  it("names a per-key limit rather than calling it an empty account", async () => {
    providerReplies(
      { data: { label: "prod", usage: 5, limit: 5, limit_remaining: 0 } },
      { data: { total_credits: 10, total_usage: 5 } }
    );
    const body = await (await GET(makeRequest())).json();
    expect(body.verdict).toMatch(/key's own spend limit is exhausted/i);
  });

  it("reports an exhausted account when that is what it is", async () => {
    providerReplies(
      { data: { label: "prod", usage: 10, limit: null } },
      { data: { total_credits: 10, total_usage: 10 } }
    );
    const body = await (await GET(makeRequest())).json();
    expect(body.account.remaining).toBe(0);
    expect(body.verdict).toMatch(/no credit left/i);
  });

  it("tells you to compare against the dashboard when funds are available", async () => {
    // The case that matters: money is there, so a failure means the
    // deployment is pointed somewhere other than where you are looking.
    providerReplies(
      { data: { label: "prod", usage: 0, limit: null } },
      { data: { total_credits: 10, total_usage: 0 } }
    );
    const body = await (await GET(makeRequest())).json();
    expect(body.account.remaining).toBe(10);
    expect(body.verdict).toMatch(/\$10\.00 is available/);
    expect(body.verdict).toMatch(/different account or workspace/i);
  });

  it("does not mistake a blocked network for a verdict about the key", async () => {
    fetchMock.mockRejectedValue(new Error("ENOTFOUND openrouter.ai"));
    const body = await (await GET(makeRequest())).json();
    expect(body.verdict).toMatch(/could not reach the provider/i);
    expect(body.verdict).not.toMatch(/revoked|credit/i);
  });

  it("reports the commit serving the request, so a stale deploy shows up", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567";
    providerReplies({ data: {} }, { data: {} });
    const body = await (await GET(makeRequest())).json();
    expect(body.environment.commit).toBe("abcdef1");
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });
});
