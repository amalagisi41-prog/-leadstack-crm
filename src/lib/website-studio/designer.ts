import "server-only";

import type { AgentSiteContent } from "@/types/agent-site";

/**
 * The AI "Designer" interview.
 *
 * A fixed, ordered script of steps (so the flow is reliable and resumable)
 * that the LLM phrases warmly and, on copy steps, turns the agent's raw
 * answer into polished website copy. The API (agent-site/designer/route.ts)
 * feeds the current step + the agent's message to the model and applies the
 * returned field updates to the site content.
 */

export interface DesignerStep {
  /** Stable key for the step. */
  key: string;
  /** Content fields this step collects. */
  fields: (keyof AgentSiteContent)[];
  /** What the designer is trying to get, in plain terms (guides the LLM). */
  goal: string;
  /**
   * When true the LLM should WRITE polished copy from the agent's raw input
   * (bio, tagline, CTA) rather than just capturing it verbatim.
   */
  writesCopy?: boolean;
}

export const DESIGNER_STEPS: DesignerStep[] = [
  {
    key: "identity",
    fields: ["agentName", "title"],
    goal: "The agent's full name and their professional title (e.g. \"REALTOR® · Luxury Specialist\"). Ask for both in one friendly question.",
  },
  {
    key: "brokerage",
    fields: ["brokerage"],
    goal: "The brokerage or team they work under.",
  },
  {
    key: "areas",
    fields: ["serviceAreas"],
    goal: "The towns / county / region they serve (e.g. \"Fairfield County, CT\").",
  },
  {
    key: "specialties",
    fields: ["specialties"],
    goal: "3–5 specialties as a short list (luxury homes, first-time buyers, waterfront, relocation, investment). Capture as an array.",
  },
  {
    key: "bio",
    fields: ["bio"],
    goal: "Ask for a few facts about their experience (years, deals closed, what clients love about them). Then WRITE a warm, credible 2–3 sentence third-person bio from those facts. Never invent numbers they didn't give.",
    writesCopy: true,
  },
  {
    key: "tagline",
    fields: ["tagline"],
    goal: "Craft a short, punchy hero headline (max ~8 words) that fits their specialty and area. Offer it, and refine if they want changes.",
    writesCopy: true,
  },
  {
    key: "contact",
    fields: ["phone", "email"],
    goal: "Their public contact phone and email.",
  },
  {
    key: "media",
    fields: ["headshotUrl", "logoUrl", "heroImageUrl"],
    goal: "Ask them to paste hosted image URLs for their headshot, their logo (optional), and a hero background photo (a signature listing or a local skyline). Capture whichever they provide.",
  },
  {
    key: "social",
    fields: ["instagram", "facebook", "linkedin"],
    goal: "Optional social profile URLs (Instagram, Facebook, LinkedIn). Any they skip stay blank.",
  },
  {
    key: "cta",
    fields: ["ctaHeadline", "ctaSubtext"],
    goal: "Write a closing call-to-action: a headline like \"Ready to make your move?\" and one supportive sentence inviting them to reach out.",
    writesCopy: true,
  },
];

export function isLastStep(step: number): boolean {
  return step >= DESIGNER_STEPS.length - 1;
}

/**
 * System prompt for one Designer turn. The model must return STRICT JSON:
 *   { "fields": { ...updates }, "reply": "next message to the agent", "advance": true|false }
 * `advance` is false only when the agent's answer for the current step was
 * empty/unclear and the designer needs to re-ask.
 */
export function buildDesignerSystemPrompt(
  stepIndex: number,
  content: AgentSiteContent,
  brandName: string,
): string {
  const step = DESIGNER_STEPS[stepIndex];
  const nextStep = DESIGNER_STEPS[stepIndex + 1];

  return `You are "Designer", the friendly AI website designer for ${brandName}. You are building a real estate agent's personal website by interviewing them ONE step at a time. Warm, encouraging, concise — one short question per turn.

CURRENT STEP ("${step.key}") — what to collect now:
${step.goal}
Target fields: ${step.fields.join(", ")}
${step.writesCopy ? "This is a COPY step: turn their raw answer into polished, professional website copy. Do not invent facts, numbers, or awards they didn't state." : "Capture their answer cleanly into the fields."}

${nextStep ? `NEXT STEP will cover: ${nextStep.goal}` : "This is the FINAL step — after capturing it, congratulate them and tell them their site is ready to preview and publish."}

Known so far (for context, don't re-ask): ${JSON.stringify({
    agentName: content.agentName,
    title: content.title,
    brokerage: content.brokerage,
    serviceAreas: content.serviceAreas,
    specialties: content.specialties,
  })}

Respond with STRICT JSON only, no markdown, no code fences:
{
  "fields": { <only the CURRENT step's fields you can fill from their answer; omit fields they didn't provide; "specialties" must be an array of strings> },
  "reply": "<your next message: acknowledge their answer briefly, then ask the NEXT step's question — or, if this was the final step, congratulate them>",
  "advance": <true if you captured enough to move on, false if you need to re-ask this step>
}`;
}
