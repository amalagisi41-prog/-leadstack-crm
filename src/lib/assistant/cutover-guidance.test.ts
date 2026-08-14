import { describe, expect, it } from "vitest";
import { getCutoverGuidance, hostingIsReady } from "./cutover-guidance";

describe("hosting cutover guidance", () => {
  it("keeps DNS locked while managed hosting is only requested", () => {
    const transfer = {
      status: "approved" as const,
      hostingStatus: "requested" as const,
      hostingUrl: null,
    };
    expect(hostingIsReady(transfer)).toBe(false);
    expect(getCutoverGuidance(transfer)).toContain("No action is required");
    expect(getCutoverGuidance(transfer)).toContain("nameservers unchanged");
  });

  it("unlocks guidance only with ready status and a verified URL", () => {
    const transfer = {
      status: "approved" as const,
      hostingStatus: "ready" as const,
      hostingUrl: "https://private.example.com",
    };
    expect(hostingIsReady(transfer)).toBe(true);
    expect(getCutoverGuidance(transfer)).toContain("hosting is ready");
  });
});
