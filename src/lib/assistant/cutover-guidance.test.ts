import { describe, expect, it } from "vitest";
import { getCutoverGuidance, hostingIsReady } from "./cutover-guidance";

describe("external-host guidance", () => {
  it("keeps the current external site and DNS when legacy hosting state exists", () => {
    const transfer = {
      status: "transfer_requested" as const,
      hostingStatus: "requested" as const,
      hostingUrl: null,
    };
    expect(hostingIsReady(transfer)).toBe(false);
    expect(getCutoverGuidance(transfer)).toContain("does not provide hosting");
    expect(getCutoverGuidance(transfer)).toContain("external provider");
  });

  it("does not unlock a hosting cutover even when legacy state says ready", () => {
    const transfer = {
      status: "hosting_ready" as const,
      hostingStatus: "ready" as const,
      hostingUrl: "https://private.example.com",
    };
    expect(hostingIsReady(transfer)).toBe(true);
    expect(getCutoverGuidance(transfer)).toContain("does not provide hosting");
  });
});
