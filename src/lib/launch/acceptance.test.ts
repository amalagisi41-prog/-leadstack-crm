import { describe, expect, it } from "vitest";
import { evaluateLaunchAcceptance, type LaunchAcceptanceInput } from "./acceptance";

const completeInput: LaunchAcceptanceInput = {
  listingInventory: {
    available: true,
    count: 1,
    sourceLabel: "MLS/IDX",
  },
  listingCreated: true,
  campaignGenerated: true,
  approved: true,
  scheduled: true,
  publishing: {
    facebook: { configured: true, publishable: true },
    instagram: { configured: true, publishable: true },
  },
  requestedChannels: ["facebook", "instagram"],
};

describe("evaluateLaunchAcceptance", () => {
  it("passes only when every observed launch step is complete", () => {
    const result = evaluateLaunchAcceptance(completeInput);
    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.status === "passed")).toBe(true);
  });

  it("accepts agent-managed inventory without an IDX connection", () => {
    const result = evaluateLaunchAcceptance({
      ...completeInput,
      listingInventory: {
        available: true,
        count: 1,
        sourceLabel: "agent-managed inventory",
      },
    });

    expect(result.passed).toBe(true);
    expect(
      result.checks.find((check) => check.id === "listing-inventory")?.status,
    ).toBe("passed");
  });

  it("does not confuse an unconnected provider with a failed live test", () => {
    const result = evaluateLaunchAcceptance({
      ...completeInput,
      publishing: { facebook: { configured: false, publishable: false } },
      requestedChannels: ["facebook", "linkedin"],
    });
    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "publish-facebook")?.status).toBe("not_verified");
    expect(result.checks.find((check) => check.id === "publish-linkedin")?.status).toBe("not_verified");
  });

  it("blocks a connected provider without publish evidence", () => {
    const result = evaluateLaunchAcceptance({
      ...completeInput,
      publishing: { facebook: { configured: true, publishable: false } },
      requestedChannels: ["facebook"],
    });
    expect(result.checks.find((check) => check.id === "publish-facebook")?.status).toBe("blocked");
  });
});
