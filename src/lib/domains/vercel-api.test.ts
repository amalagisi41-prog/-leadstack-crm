import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  addDomainToVercelProject,
  removeDomainFromVercelProject,
  getVercelDomainStatus,
  vercelApiConfigured,
} from "./vercel-api";

/**
 * The bug this file exists for: "Connect Domain" used to declare a domain
 * "live" the moment DNS pointed at Vercel's shared edge — without ever
 * checking whether Vercel had actually been told to route that hostname to
 * THIS project. These tests pin down that every caller gets an honest
 * answer: real success, a real failure with a reason, or `null`/"not
 * configured" rather than a guess.
 */

const ORIGINAL_ENV = { ...process.env };

function setConfigured() {
  process.env.VERCEL_TOKEN = "test-token";
  process.env.VERCEL_PROJECT_ID = "prj_123";
  delete process.env.VERCEL_TEAM_ID;
}

function clearConfig() {
  delete process.env.VERCEL_TOKEN;
  delete process.env.VERCEL_PROJECT_ID;
  delete process.env.VERCEL_TEAM_ID;
}

beforeEach(() => {
  clearConfig();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("vercelApiConfigured", () => {
  it("is false when either var is missing", () => {
    expect(vercelApiConfigured()).toBe(false);
    process.env.VERCEL_TOKEN = "t";
    expect(vercelApiConfigured()).toBe(false);
  });

  it("is true once both are set", () => {
    setConfigured();
    expect(vercelApiConfigured()).toBe(true);
  });
});

describe("addDomainToVercelProject", () => {
  it("refuses to guess when the deployment isn't configured", async () => {
    const outcome = await addDomainToVercelProject("example.com");
    expect(outcome).toMatchObject({ ok: false, status: "error" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports success when Vercel accepts the domain", async () => {
    setConfigured();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const outcome = await addDomainToVercelProject("example.com");
    expect(outcome).toEqual({ ok: true, status: "added" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v10/projects/prj_123/domains"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats an already-in-use conflict as success, not an error", async () => {
    setConfigured();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "domain_already_in_use" } }),
    } as Response);
    const outcome = await addDomainToVercelProject("example.com");
    expect(outcome).toEqual({ ok: true, status: "already_added" });
  });

  it("surfaces Vercel's own error message on a real failure", async () => {
    setConfigured();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "Forbidden — bad token" } }),
    } as Response);
    const outcome = await addDomainToVercelProject("example.com");
    expect(outcome).toEqual({
      ok: false,
      status: "error",
      message: "Forbidden — bad token",
    });
  });

  it("fails soft when the network call itself throws", async () => {
    setConfigured();
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    const outcome = await addDomainToVercelProject("example.com");
    expect(outcome).toEqual({
      ok: false,
      status: "error",
      message: "network down",
    });
  });

  it("includes the team query param when a team id is set", async () => {
    setConfigured();
    process.env.VERCEL_TEAM_ID = "team_abc";
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    await addDomainToVercelProject("example.com");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("teamId=team_abc"),
      expect.anything()
    );
  });
});

describe("getVercelDomainStatus", () => {
  it("returns null (not a guess) when unconfigured", async () => {
    const status = await getVercelDomainStatus("example.com");
    expect(status).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports not-attached on a 404 rather than treating it as unknown", async () => {
    setConfigured();
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);
    const status = await getVercelDomainStatus("example.com");
    expect(status).toEqual({ attached: false, verified: false });
  });

  it("reports attached + verified once Vercel confirms both", async () => {
    setConfigured();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ verified: true }),
    } as Response);
    const status = await getVercelDomainStatus("example.com");
    expect(status).toEqual({ attached: true, verified: true });
  });

  it("reports attached but not verified when Vercel says verified: false", async () => {
    setConfigured();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ verified: false }),
    } as Response);
    const status = await getVercelDomainStatus("example.com");
    expect(status).toEqual({ attached: true, verified: false });
  });

  it("returns null on an unexpected error status instead of a false negative", async () => {
    setConfigured();
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    const status = await getVercelDomainStatus("example.com");
    expect(status).toBeNull();
  });

  it("returns null when the network call throws", async () => {
    setConfigured();
    vi.mocked(fetch).mockRejectedValue(new Error("timeout"));
    const status = await getVercelDomainStatus("example.com");
    expect(status).toBeNull();
  });
});

describe("removeDomainFromVercelProject", () => {
  it("no-ops when unconfigured", async () => {
    await removeDomainFromVercelProject("example.com");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("issues a DELETE when configured", async () => {
    setConfigured();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    await removeDomainFromVercelProject("example.com");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v9/projects/prj_123/domains/example.com"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("swallows a network failure rather than throwing", async () => {
    setConfigured();
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    await expect(
      removeDomainFromVercelProject("example.com")
    ).resolves.toBeUndefined();
  });
});
