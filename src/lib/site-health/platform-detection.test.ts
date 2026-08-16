import { describe, expect, it } from "vitest";
import {
  detectHostingPlatform,
  isConfirmedOffPlatform,
} from "./platform-detection";

/**
 * The trap these exist to close: a site still hosted as a GoHighLevel funnel
 * answers 200 over HTTPS at the agent's own domain. Liveness alone would
 * report "your website is live" and let Site Health reach 100%, and
 * cancelling GHL on the strength of that number takes the site down.
 */
describe("identifying who serves a website", () => {
  it("catches a site still served by GoHighLevel", () => {
    const detection = detectHostingPlatform({
      finalHost: "example-realty.test",
      headers: { server: "nginx" },
      body: '<script src="https://cdn.msgsndr.com/bundle.js"></script>',
    });

    expect(detection.platform).toBe("gohighlevel");
    expect(detection.confidence).toBe("confirmed");
    expect(detection.evidence.join(" ")).toMatch(/msgsndr/);
  });

  it("catches GoHighLevel via the redirect chain", () => {
    const detection = detectHostingPlatform({
      finalHost: "funnels.leadconnectorhq.com",
      headers: {},
      redirectHosts: ["example-realty.test"],
    });

    expect(detection.platform).toBe("gohighlevel");
  });

  it("identifies Hostinger, which is how a move off GHL is proven", () => {
    // The AHN case: www CNAMEd to Hostinger Horizons.
    const detection = detectHostingPlatform({
      finalHost: "vibe.ludicrous.cloud",
      headers: {},
    });

    expect(detection.platform).toBe("hostinger");
    expect(detection.confidence).toBe("confirmed");
  });

  it("identifies Wix and Squarespace from their headers", () => {
    expect(
      detectHostingPlatform({
        finalHost: "example.com",
        headers: { "x-wix-request-id": "abc" },
      }).platform
    ).toBe("wix");
    expect(
      detectHostingPlatform({
        finalHost: "example.com",
        headers: { server: "Squarespace" },
      }).platform
    ).toBe("squarespace");
  });

  it("reports unknown rather than guessing when nothing matches", () => {
    const detection = detectHostingPlatform({
      finalHost: "example-realty.test",
      headers: { server: "cloudflare" },
      body: "<html><body>Hello</body></html>",
    });

    expect(detection.platform).toBeNull();
    expect(detection.confidence).toBe("unknown");
    // The agent still sees what was observed, so they can judge it themselves.
    expect(detection.evidence).toContain("served from example-realty.test");
    expect(detection.evidence.join(" ")).toMatch(/cloudflare/);
  });

  it("does not match a host that merely contains the signature string", () => {
    // "notleadconnectorhq.com.example.com" must not read as GoHighLevel.
    const detection = detectHostingPlatform({
      finalHost: "leadconnectorhq.com.evil.example",
      headers: {},
    });
    expect(detection.platform).toBeNull();
  });
});

describe("deciding whether a site has left the old platform", () => {
  const onGhl = detectHostingPlatform({
    finalHost: "example-realty.test",
    headers: {},
    body: "cdn.msgsndr.com",
  });
  const onHostinger = detectHostingPlatform({
    finalHost: "vibe.ludicrous.cloud",
    headers: {},
  });
  const unknown = detectHostingPlatform({
    finalHost: "example-realty.test",
    headers: { server: "cloudflare" },
  });

  it("passes when the site is confirmed on a different platform", () => {
    expect(isConfirmedOffPlatform(onHostinger, "gohighlevel")).toBe(true);
  });

  it("fails when the site is still on the old platform", () => {
    expect(isConfirmedOffPlatform(onGhl, "gohighlevel")).toBe(false);
  });

  it("FAILS on an inconclusive scan — absence of evidence is not proof", () => {
    // The single most important assertion here. A heuristic that cannot
    // identify the host must never green-light a cancellation; the agent is
    // asked to confirm instead.
    expect(isConfirmedOffPlatform(unknown, "gohighlevel")).toBe(false);
  });

  it("fails safe on missing inputs", () => {
    expect(isConfirmedOffPlatform(null, "gohighlevel")).toBe(false);
    expect(isConfirmedOffPlatform(onHostinger, null)).toBe(false);
  });
});
