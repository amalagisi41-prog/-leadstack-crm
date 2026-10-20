import "server-only";

import { scrapeUrl, firecrawlIsConfigured, FirecrawlError } from "@/lib/firecrawl/client";
import { callAi, aiIsConfigured } from "@/lib/comms/ai/openrouter";

/**
 * Audits a landing page's CONTENT for conversion readiness — deliberately
 * not a "mobile audit" or a visual/CSS audit. Firecrawl returns the page's
 * rendered markdown, not a screenshot or computed styles, so this can only
 * see what the words and structure say: is there a clear call to action, is
 * contact info present, are trust signals (license, brokerage, reviews)
 * there, is the value proposition clear. Claiming to assess mobile layout or
 * visual design from text content would be exactly the kind of unverified
 * claim CLAUDE.md's "no guessing" standard exists to catch.
 */

export type LandingAuditSeverity = "pass" | "warn" | "fail";
export type LandingAuditCategory = "cta" | "trust" | "contact" | "clarity";

export interface LandingAuditFinding {
  category: LandingAuditCategory;
  severity: LandingAuditSeverity;
  note: string;
}

export interface LandingAuditResult {
  url: string;
  score: number;
  summary: string;
  findings: LandingAuditFinding[];
  model: string;
  totalTokens: number;
}

const CATEGORIES: readonly LandingAuditCategory[] = ["cta", "trust", "contact", "clarity"];
const SEVERITIES: readonly LandingAuditSeverity[] = ["pass", "warn", "fail"];

const SYSTEM_PROMPT = `You audit a real-estate landing page's CONTENT for conversion readiness, reading only the page's text/markdown — you have NOT seen how it renders, so never comment on layout, mobile responsiveness, colors, or visual design; stick to what the words and structure say.

Score four categories, each "pass", "warn", or "fail", with one short, specific note per category grounded in what you actually read on the page (quote or paraphrase the actual text when flagging a problem — never a generic "could be clearer"):
- cta: is there one clear next action (schedule a showing, call, request info) and is it easy to find in the text?
- trust: license number, brokerage name, or any credibility signal (testimonials, years in business) present?
- contact: a phone number, email, or contact form reachable from the text?
- clarity: is the value proposition (what this page is for, who it's for) stated plainly near the top?

Then an overall score 0-100 (weight all four evenly) and a 1-2 sentence summary.

Respond with JSON: {"score": number, "summary": string, "findings": [{"category": "cta"|"trust"|"contact"|"clarity", "severity": "pass"|"warn"|"fail", "note": string}]} — exactly one finding per category, in that order.`;

function parseModelResponse(raw: string): {
  score: number;
  summary: string;
  findings: LandingAuditFinding[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The landing-page audit model did not return valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The landing-page audit model returned an unexpected shape.");
  }
  const obj = parsed as {
    score?: unknown;
    summary?: unknown;
    findings?: unknown;
  };
  if (
    typeof obj.score !== "number" ||
    typeof obj.summary !== "string" ||
    !Array.isArray(obj.findings)
  ) {
    throw new Error("The landing-page audit model returned an unexpected shape.");
  }

  const findings = obj.findings.filter(
    (f): f is LandingAuditFinding =>
      typeof f === "object" &&
      f !== null &&
      CATEGORIES.includes((f as LandingAuditFinding).category) &&
      SEVERITIES.includes((f as LandingAuditFinding).severity) &&
      typeof (f as LandingAuditFinding).note === "string"
  );
  if (findings.length === 0) {
    throw new Error("The landing-page audit model returned no usable findings.");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(obj.score))),
    summary: obj.summary.trim(),
    findings,
  };
}

export async function auditLandingPage(url: string): Promise<LandingAuditResult> {
  if (!firecrawlIsConfigured()) {
    throw new Error(
      "FIRECRAWL_API_KEY is not set on this deployment — the landing-page audit needs it to read the page."
    );
  }
  if (!aiIsConfigured()) {
    throw new Error(
      "OPENROUTER_API_KEY is not set on this deployment — the landing-page audit needs AgentStack's AI gateway configured."
    );
  }

  let markdown: string;
  try {
    const scraped = await scrapeUrl(url);
    markdown = scraped.markdown;
  } catch (error) {
    if (error instanceof FirecrawlError) {
      throw new Error(`Could not read that page: ${error.message}`);
    }
    throw error;
  }

  if (!markdown.trim()) {
    throw new Error("That page returned no readable content to audit.");
  }

  // Keep well under typical context limits — a landing page's own text is
  // what matters, not an entire multi-thousand-word site dump.
  const truncated = markdown.slice(0, 12_000);

  const result = await callAi({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Page content (markdown):\n\n${truncated}` },
    ],
    responseFormat: { type: "json_object" },
    maxTokens: 600,
    temperature: 0.3,
  });

  const { score, summary, findings } = parseModelResponse(result.text);
  return {
    url,
    score,
    summary,
    findings,
    model: result.model,
    totalTokens: result.totalTokens,
  };
}
