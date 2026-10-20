import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockCallAi, mockAiIsConfigured } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  mockAiIsConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/comms/ai/openrouter", () => ({
  aiIsConfigured: mockAiIsConfigured,
  callAi: mockCallAi,
}));

import { buildPerformanceNarrative } from "./performance-narrative";
import type { ReportsSummary } from "@/lib/reports/summary";

const summary: ReportsSummary = {
  range: "30d",
  rangeDays: 30,
  currency: "USD",
  kpis: {
    newLeads: 12,
    wonDeals: 3,
    lostDeals: 1,
    openDeals: 4,
    wonValue: 15000,
    openValue: 20000,
    avgDealValue: 5000,
    winRatePct: 75,
  },
  funnel: [{ stageId: "new", label: "New", count: 2, value: 1000 }],
  wonRevenueTimeline: [],
  newLeadsTimeline: [],
  leadsBySource: [{ source: "referral", count: 7 }],
};

beforeEach(() => {
  mockCallAi.mockReset();
  mockAiIsConfigured.mockReset();
  mockAiIsConfigured.mockReturnValue(true);
});

describe("buildPerformanceNarrative", () => {
  it("parses a well-formed model response", async () => {
    mockCallAi.mockResolvedValue({
      text: JSON.stringify({
        narrative: "Strong month: 3 deals closed worth $15,000.",
        recommendations: ["Follow up on the 4 open deals.", "Lean into referrals — your top source."],
      }),
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "anthropic/claude-haiku-4.5",
    });

    const result = await buildPerformanceNarrative({ summary, businessName: "Acme Realty" });

    expect(result.narrative).toBe("Strong month: 3 deals closed worth $15,000.");
    expect(result.recommendations).toHaveLength(2);
    expect(result.model).toBe("anthropic/claude-haiku-4.5");
    expect(result.totalTokens).toBe(150);
  });

  it("throws a clear error when the model doesn't return JSON", async () => {
    mockCallAi.mockResolvedValue({
      text: "Sure! Here's a summary: things are going well.",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      model: "test",
    });

    await expect(
      buildPerformanceNarrative({ summary, businessName: null })
    ).rejects.toThrow(/valid JSON/);
  });

  it("throws when the JSON is well-formed but missing the expected fields", async () => {
    mockCallAi.mockResolvedValue({
      text: JSON.stringify({ summary: "wrong shape entirely" }),
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      model: "test",
    });

    await expect(
      buildPerformanceNarrative({ summary, businessName: null })
    ).rejects.toThrow(/unexpected shape/);
  });

  it("refuses to run when the AI gateway isn't configured, without calling it", async () => {
    mockAiIsConfigured.mockReturnValue(false);

    await expect(
      buildPerformanceNarrative({ summary, businessName: null })
    ).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it("drops non-string recommendation entries rather than failing the whole response", async () => {
    mockCallAi.mockResolvedValue({
      text: JSON.stringify({
        narrative: "Fine.",
        recommendations: ["Real one", 42, null, "Another real one"],
      }),
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      model: "test",
    });

    const result = await buildPerformanceNarrative({ summary, businessName: null });
    expect(result.recommendations).toEqual(["Real one", "Another real one"]);
  });
});
