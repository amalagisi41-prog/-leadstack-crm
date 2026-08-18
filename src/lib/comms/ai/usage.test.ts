import { beforeEach, describe, expect, it, vi } from "vitest";

const setMock = vi.fn(async () => undefined);
const docMock = vi.fn(() => ({ set: setMock }));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({ doc: docMock }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: (n: number) => ({ __increment: n }),
    serverTimestamp: () => "SERVER_TIMESTAMP",
  },
}));

import {
  PLATFORM_SCOPE,
  estimateCostUsd,
  normaliseModelId,
  recordAiUsage,
  usagePeriod,
} from "./usage";

/**
 * What each workspace costs us.
 *
 * The conversational channels metered themselves from the start; nothing else
 * did — including the Business Blueprint import, the most expensive call in
 * the product. Without attribution there is no way to price a tier against
 * real numbers, spot one workspace in a loop, or see the shared prepaid
 * balance draining before every AI feature stops at once.
 */

const HAIKU = {
  promptTokens: 4_000,
  completionTokens: 1_000,
  totalTokens: 5_000,
  model: "anthropic/claude-haiku-4-5",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pricing a completion", () => {
  it("strips the provider prefix and any variant suffix", () => {
    expect(normaliseModelId("anthropic/claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(normaliseModelId("anthropic/claude-haiku-4-5:beta")).toBe(
      "claude-haiku-4-5"
    );
    expect(normaliseModelId("Claude-Haiku-4-5")).toBe("claude-haiku-4-5");
  });

  it("prices Haiku at a dollar in, five out, per million", () => {
    // 4,000 in = $0.004; 1,000 out = $0.005.
    expect(estimateCostUsd(4_000, 1_000, "anthropic/claude-haiku-4-5")).toBeCloseTo(
      0.009,
      6
    );
  });

  it("prices the bigger models higher, so a per-account override shows up", () => {
    const haiku = estimateCostUsd(10_000, 2_000, "claude-haiku-4-5");
    const opus = estimateCostUsd(10_000, 2_000, "claude-opus-5");
    expect(opus).toBeGreaterThan(haiku * 4);
  });

  it("over-estimates an unrecognised model rather than under", () => {
    // A spend estimate that reads low is the dangerous direction: it looks
    // like headroom that is not there.
    const unknown = estimateCostUsd(10_000, 2_000, "some/new-model-v9");
    const haiku = estimateCostUsd(10_000, 2_000, "claude-haiku-4-5");
    expect(unknown).toBeGreaterThan(haiku);
  });

  it("costs nothing for nothing", () => {
    expect(estimateCostUsd(0, 0, "claude-haiku-4-5")).toBe(0);
  });
});

describe("the billing period", () => {
  it("keys on UTC, so a month boundary means one thing everywhere", () => {
    expect(usagePeriod(new Date("2026-03-01T00:30:00Z"))).toBe("2026-03");
    // 23:30 on Feb 28 in UTC-8 is still February in UTC terms at 07:30 Mar 1.
    expect(usagePeriod(new Date("2026-03-01T07:30:00Z"))).toBe("2026-03");
    expect(usagePeriod(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });

  it("pads single-digit months", () => {
    expect(usagePeriod(new Date("2026-07-15T12:00:00Z"))).toBe("2026-07");
  });
});

describe("recording usage", () => {
  it("writes to the workspace's row for the period", async () => {
    await recordAiUsage({
      subAccountId: "sub-1",
      feature: "blueprint_import",
      completion: HAIKU,
      at: new Date("2026-08-18T10:00:00Z"),
    });

    expect(docMock).toHaveBeenCalledWith("aiUsage/2026-08/scopes/sub-1");
    const [written] = setMock.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(written.subAccountId).toBe("sub-1");
    expect(written.totalTokens).toEqual({ __increment: 5_000 });
    expect(written.calls).toEqual({ __increment: 1 });
  });

  it("attributes the spend to the feature that caused it", async () => {
    await recordAiUsage({
      subAccountId: "sub-1",
      feature: "website_designer",
      completion: HAIKU,
    });

    const [written] = setMock.mock.calls[0] as unknown as [
      { byFeature: Record<string, { costUsd: { __increment: number } }> },
    ];
    expect(written.byFeature.website_designer.costUsd.__increment).toBeCloseTo(
      0.009,
      6
    );
  });

  it("merges rather than overwriting, so counters accumulate", async () => {
    await recordAiUsage({
      subAccountId: "sub-1",
      feature: "assistant",
      completion: HAIKU,
    });
    expect(setMock.mock.calls[0][1]).toEqual({ merge: true });
  });

  it("puts untenanted spend on the platform scope instead of losing it", async () => {
    // Onboarding help runs before a workspace exists. Dropping it would make
    // the per-tenant rows silently disagree with the provider's invoice.
    await recordAiUsage({
      subAccountId: null,
      feature: "onboarding_help",
      completion: HAIKU,
      at: new Date("2026-08-18T10:00:00Z"),
    });
    expect(docMock).toHaveBeenCalledWith(
      `aiUsage/2026-08/scopes/${PLATFORM_SCOPE}`
    );
  });

  it("writes nothing for a completion that used no tokens", async () => {
    await recordAiUsage({
      subAccountId: "sub-1",
      feature: "persona",
      completion: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model: "claude-haiku-4-5",
      },
    });
    expect(setMock).not.toHaveBeenCalled();
  });

  it("never throws when Firestore is unavailable", async () => {
    // Metering that can break the feature it measures is worse than none.
    setMock.mockRejectedValueOnce(new Error("Firestore unavailable"));
    await expect(
      recordAiUsage({
        subAccountId: "sub-1",
        feature: "field_assist",
        completion: HAIKU,
      })
    ).resolves.toBeUndefined();
  });
});
