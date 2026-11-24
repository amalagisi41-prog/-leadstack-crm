import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockCallAi, mockAiIsConfigured, mockScrapeUrl, mockFirecrawlIsConfigured } =
  vi.hoisted(() => ({
    mockCallAi: vi.fn(),
    mockAiIsConfigured: vi.fn(() => true),
    mockScrapeUrl: vi.fn(),
    mockFirecrawlIsConfigured: vi.fn(() => true),
  }));

vi.mock("@/lib/comms/ai/openrouter", () => ({
  aiIsConfigured: mockAiIsConfigured,
  callAi: mockCallAi,
}));

vi.mock("@/lib/firecrawl/client", () => ({
  firecrawlIsConfigured: mockFirecrawlIsConfigured,
  scrapeUrl: mockScrapeUrl,
  FirecrawlError: class FirecrawlError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { auditLandingPage } from "./landing-audit";

beforeEach(() => {
  mockCallAi.mockReset();
  mockAiIsConfigured.mockReset();
  mockAiIsConfigured.mockReturnValue(true);
  mockScrapeUrl.mockReset();
  mockScrapeUrl.mockResolvedValue({
    markdown: "# Acme Realty\nCall us at 555-1234 to schedule a showing.",
    title: "Acme Realty",
    sourceUrl: "https://acme.example",
  });
  mockFirecrawlIsConfigured.mockReset();
  mockFirecrawlIsConfigured.mockReturnValue(true);
});

const wellFormedResponse = {
  score: 82,
  summary: "Clear CTA and contact info; license number is missing.",
  findings: [
    { category: "cta", severity: "pass", note: "\"Call us at 555-1234 to schedule a showing\" is a clear next step." },
    { category: "trust", severity: "warn", note: "No license number or brokerage name found." },
    { category: "contact", severity: "pass", note: "Phone number 555-1234 is present." },
    { category: "clarity", severity: "pass", note: "Page states it's Acme Realty near the top." },
  ],
};

describe("auditLandingPage", () => {
  it("scrapes the page and parses a well-formed model response", async () => {
    mockCallAi.mockResolvedValue({
      text: JSON.stringify(wellFormedResponse),
      promptTokens: 200,
      completionTokens: 80,
      totalTokens: 280,
      model: "anthropic/claude-haiku-4.5",
    });

    const result = await auditLandingPage("https://acme.example");

    expect(mockScrapeUrl).toHaveBeenCalledWith("https://acme.example");
    expect(result.score).toBe(82);
    expect(result.findings).toHaveLength(4);
    expect(result.url).toBe("https://acme.example");
  });

  it("clamps an out-of-range score into 0-100", async () => {
    mockCallAi.mockResolvedValue({
      text: JSON.stringify({ ...wellFormedResponse, score: 140 }),
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      model: "test",
    });
    const result = await auditLandingPage("https://acme.example");
    expect(result.score).toBe(100);
  });

  it("refuses to run when Firecrawl isn't configured, without calling the model", async () => {
    mockFirecrawlIsConfigured.mockReturnValue(false);
    await expect(auditLandingPage("https://acme.example")).rejects.toThrow(/FIRECRAWL_API_KEY/);
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it("refuses to run when the AI gateway isn't configured", async () => {
    mockAiIsConfigured.mockReturnValue(false);
    await expect(auditLandingPage("https://acme.example")).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it("surfaces a scrape failure as a clear, actionable error rather than a raw exception", async () => {
    const { FirecrawlError } = await import("@/lib/firecrawl/client");
    mockScrapeUrl.mockRejectedValue(new FirecrawlError("Firecrawl returned 404", 404));
    await expect(auditLandingPage("https://acme.example")).rejects.toThrow(/Could not read that page/);
  });

  it("throws when the model returns malformed JSON", async () => {
    mockCallAi.mockResolvedValue({
      text: "This page looks great overall!",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      model: "test",
    });
    await expect(auditLandingPage("https://acme.example")).rejects.toThrow(/valid JSON/);
  });

  it("drops findings with an unrecognized category or severity rather than failing outright", async () => {
    mockCallAi.mockResolvedValue({
      text: JSON.stringify({
        score: 70,
        summary: "Mixed signals.",
        findings: [
          { category: "cta", severity: "pass", note: "Fine." },
          { category: "made-up-category", severity: "pass", note: "Should be dropped." },
        ],
      }),
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      model: "test",
    });
    const result = await auditLandingPage("https://acme.example");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].category).toBe("cta");
  });
});
