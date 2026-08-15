import "server-only";

import { checkFairHousing } from "@/lib/workflows/guardrails";
import type { AgentSiteContent } from "@/types/agent-site";

/**
 * Fair Housing screening for published website copy.
 *
 * Outbound workflow messages already compile through
 * `lib/workflows/guardrails.ts`, which BLOCKS a send on steering language.
 * Website copy had no equivalent enforcement: the Business Blueprint injects
 * a Fair Housing *instruction* into Zack's prompt, but an instruction is not
 * a control — a prompt-injected or simply unlucky generation could put
 * steering language straight onto a live published page.
 *
 * This module closes that gap by reusing the same blocklist against the
 * content fields that actually render publicly. Same caveat as the workflow
 * guardrail applies: this is a best-effort filter over representative
 * HUD/NAR-flagged phrasing, not legal review, and it does not relieve the
 * operator of their own compliance obligations.
 */

/**
 * Content keys carrying published prose. Deliberately excludes contact
 * details and media/social URLs — those are not prose, and scanning them
 * would only produce false positives on domain names.
 */
export const SCREENED_CONTENT_KEYS: readonly (keyof AgentSiteContent)[] = [
  "agentName",
  "title",
  "brokerage",
  "tagline",
  "bio",
  "serviceAreas",
  "specialties",
  "ctaHeadline",
  "ctaSubtext",
  "metaTitle",
  "metaDescription",
];

export interface BlockedContentField {
  field: string;
  phrases: string[];
}

export interface ContentComplianceResult {
  /** Input minus any field that failed screening. */
  safeFields: Record<string, unknown>;
  /** Every field that failed, with the phrases that tripped it. */
  blocked: BlockedContentField[];
}

function screenValue(value: unknown): string[] {
  if (typeof value === "string") {
    return checkFairHousing(value).matchedPhrases;
  }
  if (Array.isArray(value)) {
    // e.g. specialties[] — screen each entry, report the union.
    const phrases = new Set<string>();
    for (const entry of value) {
      if (typeof entry !== "string") continue;
      for (const phrase of checkFairHousing(entry).matchedPhrases) {
        phrases.add(phrase);
      }
    }
    return [...phrases];
  }
  return [];
}

/**
 * Screen a partial content update. Returns the fields that are safe to
 * persist plus a report of what was rejected, so the caller can decide
 * whether to drop-and-explain (AI-generated) or refuse outright
 * (user-submitted).
 */
export function screenContentFields(
  fields: Record<string, unknown>
): ContentComplianceResult {
  const safeFields: Record<string, unknown> = {};
  const blocked: BlockedContentField[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (!SCREENED_CONTENT_KEYS.includes(key as keyof AgentSiteContent)) {
      safeFields[key] = value;
      continue;
    }
    const phrases = screenValue(value);
    if (phrases.length > 0) {
      blocked.push({ field: key, phrases });
      continue;
    }
    safeFields[key] = value;
  }

  return { safeFields, blocked };
}

/** Human-readable explanation appended to Zack's reply when copy is dropped. */
export function describeBlockedFields(blocked: BlockedContentField[]): string {
  if (blocked.length === 0) return "";
  const details = blocked
    .map((b) => `${b.field} (${b.phrases.map((p) => `"${p}"`).join(", ")})`)
    .join("; ");
  return `\n\n⚠️ I held back some copy for Fair Housing reasons — ${details}. Language that references or implies preferences about protected classes can't go on a published listing site. Tell me what you meant and I'll rewrite it a compliant way.`;
}
