import { describe, expect, it } from "vitest";
import {
  SITE_VERIFICATION_TTL_DAYS,
  evaluateLivenessResponse,
  isVerificationCurrent,
  livenessNetworkFailure,
  type SiteVerificationRecord,
} from "./liveness";

const at = (url: string, statusCode: number, protocol = "https:") =>
  evaluateLivenessResponse({ url, protocol, statusCode });

describe("interpreting a website's response", () => {
  it("counts a plain 200 as live", () => {
    const record = at("https://example-realty.test/", 200);
    expect(record.status).toBe("live");
    expect(record.statusCode).toBe(200);
  });

  it("counts a redirect as live", () => {
    // Most real sites answer their apex with a 301 to www or to https;
    // following it would tell us nothing extra about whether a site exists.
    expect(at("https://example-realty.test/", 301).status).toBe("live");
    expect(at("https://example-realty.test/", 308).status).toBe("live");
  });

  it("counts a protected site as live", () => {
    // Behind Cloudflare or basic auth is still a website that exists.
    expect(at("https://x.com/", 401).status).toBe("live");
    expect(at("https://x.com/", 403).status).toBe("live");
  });

  it("does not count a missing page as live", () => {
    const record = at("https://example-realty.test/", 404);
    expect(record.status).toBe("unreachable");
    expect(record.reason).toMatch(/nothing is published/i);
  });

  it("distinguishes a host error from an empty domain", () => {
    const record = at("https://example-realty.test/", 503);
    expect(record.status).toBe("unreachable");
    expect(record.reason).toMatch(/server error/i);
    expect(record.reason).toMatch(/pointed correctly/i);
  });

  it("refuses to pass a site served without TLS", () => {
    const record = at("http://example-realty.test/", 200, "http:");
    expect(record.status).toBe("insecure");
    expect(record.reason).toMatch(/SSL certificate/i);
  });

  it("explains a network failure in terms an agent can act on", () => {
    const record = livenessNetworkFailure("https://example-realty.test/");
    expect(record.status).toBe("unreachable");
    expect(record.reason).toMatch(/DNS/i);
  });
});

describe("whether a stored verification still counts", () => {
  const now = new Date("2026-08-16T12:00:00Z");
  const record = (
    overrides: Partial<SiteVerificationRecord> = {}
  ): SiteVerificationRecord => ({
    url: "https://example-realty.test/",
    status: "live",
    reason: "Your website is live.",
    checkedAt: "2026-08-15T12:00:00Z",
    ...overrides,
  });

  it("accepts a recent live check of the saved domain", () => {
    expect(
      isVerificationCurrent(record(), "example-realty.test", now)
    ).toBe(true);
  });

  it("ignores the www prefix on either side", () => {
    expect(
      isVerificationCurrent(
        record({ url: "https://www.example-realty.test/" }),
        "example-realty.test",
        now
      )
    ).toBe(true);
    expect(
      isVerificationCurrent(record(), "www.example-realty.test", now)
    ).toBe(true);
  });

  it("expires so a site that goes dark stops counting", () => {
    const stale = record({
      checkedAt: new Date(
        now.getTime() - (SITE_VERIFICATION_TTL_DAYS + 1) * 86_400_000
      ).toISOString(),
    });
    expect(isVerificationCurrent(stale, "example-realty.test", now)).toBe(
      false
    );
  });

  it("does not carry over to a different domain", () => {
    // Changing the saved domain invalidates a check of the previous one.
    expect(isVerificationCurrent(record(), "somewhere-else.com", now)).toBe(
      false
    );
  });

  it("rejects a failed or missing check", () => {
    expect(
      isVerificationCurrent(
        record({ status: "unreachable" }),
        "example-realty.test",
        now
      )
    ).toBe(false);
    expect(isVerificationCurrent(null, "example-realty.test", now)).toBe(
      false
    );
  });

  it("rejects a check when no domain is saved", () => {
    expect(isVerificationCurrent(record(), "", now)).toBe(false);
    expect(isVerificationCurrent(record(), null, now)).toBe(false);
  });

  it("rejects a malformed record rather than trusting it", () => {
    expect(
      isVerificationCurrent(
        record({ url: "not a url" }),
        "example-realty.test",
        now
      )
    ).toBe(false);
    expect(
      isVerificationCurrent(
        record({ checkedAt: "whenever" }),
        "example-realty.test",
        now
      )
    ).toBe(false);
  });

  it("rejects a check dated in the future", () => {
    const future = record({ checkedAt: "2027-01-01T00:00:00Z" });
    expect(
      isVerificationCurrent(future, "example-realty.test", now)
    ).toBe(false);
  });
});
