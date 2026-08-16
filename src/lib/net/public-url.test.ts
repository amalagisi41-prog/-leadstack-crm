import { describe, expect, it } from "vitest";
import { normalizePublicUrl, normalizePublicUrlString } from "./public-url";

/**
 * This guard stands between an agent-supplied address and a server-side
 * fetch, so every case below is an SSRF the deployment would otherwise make
 * on the caller's behalf.
 */
describe("public URL guard", () => {
  it("accepts ordinary public addresses", () => {
    expect(normalizePublicUrl("https://artisanhomenetwork.com")?.hostname).toBe(
      "artisanhomenetwork.com"
    );
    expect(normalizePublicUrl("artisanhomenetwork.com")?.protocol).toBe(
      "https:"
    );
    expect(normalizePublicUrl("http://example.com")?.protocol).toBe("http:");
    expect(normalizePublicUrl("  example.com/page  ")?.pathname).toBe("/page");
  });

  it("rejects loopback and unspecified addresses", () => {
    for (const host of [
      "localhost",
      "http://localhost:3000",
      "127.0.0.1",
      "http://127.99.1.2",
      "0.0.0.0",
      "http://[::1]",
    ]) {
      expect(normalizePublicUrl(host), host).toBeNull();
    }
  });

  it("rejects private network ranges", () => {
    for (const host of [
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
    ]) {
      expect(normalizePublicUrl(`https://${host}`), host).toBeNull();
    }
  });

  it("allows public addresses that merely look adjacent to private ones", () => {
    // 172.32.x and 11.x sit outside the reserved blocks.
    expect(normalizePublicUrl("https://172.32.0.1")).not.toBeNull();
    expect(normalizePublicUrl("https://11.0.0.1")).not.toBeNull();
  });

  it("rejects cloud metadata link-local addresses", () => {
    expect(normalizePublicUrl("http://169.254.169.254/latest/meta-data")).toBeNull();
  });

  it("rejects internal-only hostnames", () => {
    for (const host of [
      "https://intranet",
      "https://db.internal",
      "https://printer.local",
      "https://api.localhost",
    ]) {
      expect(normalizePublicUrl(host), host).toBeNull();
    }
  });

  it("rejects non-http schemes and junk", () => {
    for (const value of [
      "file:///etc/passwd",
      "ftp://example.com",
      "javascript:alert(1)",
      "",
      "   ",
      null,
      undefined,
      42,
    ]) {
      expect(normalizePublicUrl(value), String(value)).toBeNull();
    }
  });

  it("returns a string form for callers that want one", () => {
    expect(normalizePublicUrlString("example.com")).toBe("https://example.com/");
    expect(normalizePublicUrlString("localhost")).toBeNull();
  });
});
