import "server-only";

import { callAi, aiIsConfigured } from "@/lib/comms/ai/openrouter";
import type { ReportsSummary } from "@/lib/reports/summary";
import { formatCurrency } from "@/lib/format";

/**
 * The first real AI-backed entry in the marketing tool registry
 * (lib/marketing/tool-registry.ts) — every existing listing-campaign skill
 * there is deterministic (a hardcoded LSEO score, a distress-phrase
 * blocklist). This one genuinely needs a model: turning a KPI summary into
 * plain-English prose and a short, specific list of next actions isn't
 * something a formula does well.
 *
 * Grounded strictly in the numbers passed in — the prompt is explicit that
 * nothing outside `summary` may be stated as fact, the same "no invented
 * facts" discipline the listing-campaign tools already enforce, just applied
 * to performance data instead of listing copy.
 */

export interface PerformanceNarrativeResult {
  narrative: string;
  recommendations: string[];
  model: string;
  totalTokens: number;
}

const SYSTEM_PROMPT = `You write short, plain-English performance summaries for a real-estate agent's CRM dashboard.

Rules:
- Use ONLY the numbers given to you. Never invent a figure, a trend, a competitor comparison, or a cause you weren't told.
- If a number is zero or there isn't enough data to say something meaningful, say that plainly instead of padding with generic encouragement.
- Write 2-4 sentences of narrative, then 2-3 short, specific, actionable recommendations grounded in the actual numbers (e.g. reference an actual source, stage, or figure you were given — never a generic "keep up the great work").
- No markdown, no emoji, no greeting.
- Respond with a JSON object: {"narrative": string, "recommendations": string[]}`;

function buildUserPrompt(summary: ReportsSummary, businessName?: string | null): string {
  const rangeLabel =
    summary.range === "all" ? "all time" : `the last ${summary.rangeDays} days`;
  const topSource = summary.leadsBySource[0];
  const funnelLine = summary.funnel
    .map((f) => `${f.label}: ${f.count} (${formatCurrency(f.value, summary.currency)})`)
    .join("; ");

  return [
    `Business: ${businessName?.trim() || "this workspace"}.`,
    `Range: ${rangeLabel}.`,
    `New leads: ${summary.kpis.newLeads}.`,
    `Won deals: ${summary.kpis.wonDeals}, worth ${formatCurrency(summary.kpis.wonValue, summary.currency)}.`,
    `Open deals: ${summary.kpis.openDeals}, worth ${formatCurrency(summary.kpis.openValue, summary.currency)}.`,
    `Lost deals: ${summary.kpis.lostDeals}.`,
    `Average won deal size: ${formatCurrency(summary.kpis.avgDealValue, summary.currency)}.`,
    `Win rate: ${summary.kpis.winRatePct}%.`,
    `Current pipeline by stage: ${funnelLine}.`,
    topSource
      ? `Top lead source in range: ${topSource.source} (${topSource.count} leads).`
      : "No leads with a recorded source in range.",
  ].join("\n");
}

function parseModelResponse(raw: string): { narrative: string; recommendations: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The performance narrative model did not return valid JSON.");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { narrative?: unknown }).narrative !== "string" ||
    !Array.isArray((parsed as { recommendations?: unknown }).recommendations)
  ) {
    throw new Error("The performance narrative model returned an unexpected shape.");
  }
  const { narrative, recommendations } = parsed as {
    narrative: string;
    recommendations: unknown[];
  };
  return {
    narrative: narrative.trim(),
    recommendations: recommendations
      .filter((r): r is string => typeof r === "string")
      .map((r) => r.trim())
      .filter(Boolean),
  };
}

export async function buildPerformanceNarrative(args: {
  summary: ReportsSummary;
  businessName?: string | null;
}): Promise<PerformanceNarrativeResult> {
  if (!aiIsConfigured()) {
    throw new Error(
      "OPENROUTER_API_KEY is not set on this deployment — the performance narrative needs AgentStack's AI gateway configured."
    );
  }

  const result = await callAi({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(args.summary, args.businessName) },
    ],
    responseFormat: { type: "json_object" },
    maxTokens: 450,
    temperature: 0.4,
  });

  const { narrative, recommendations } = parseModelResponse(result.text);
  return {
    narrative,
    recommendations,
    model: result.model,
    totalTokens: result.totalTokens,
  };
}
