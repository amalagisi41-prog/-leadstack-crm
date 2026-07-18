import { matchEscalationKeyword } from "@/lib/comms/ai/escalation";
import { secondsUntilSendWindow } from "./send-window";
import type { SendWindow } from "@/types/tenancy";

/**
 * Shared guardrail layer every Method Template's outbound send compiles
 * through, per the Phase 1 spec: Fair Housing constraints, quiet hours (with
 * an inbound-triggered exemption), and escalation keywords. Pure — no I/O —
 * so it's unit-testable with adversarial inputs independent of the engine
 * that calls it (`lib/workflows/engine.ts`).
 *
 * This is a best-effort content filter, not a substitute for legal review.
 * Operators are still responsible for their own compliance obligations —
 * the blocklist below is representative of HUD/NAR-flagged steering
 * language, not an exhaustive or authoritative list.
 */

export interface FairHousingCheckResult {
  blocked: boolean;
  matchedPhrases: string[];
}

// Representative steering/protected-class language across the 7 federally
// protected classes (race, color, national origin, religion, sex, familial
// status, disability). Lowercase, checked as case-insensitive substrings.
export const FAIR_HOUSING_BLOCKLIST: string[] = [
  // Familial status
  "no kids",
  "no children",
  "adults only",
  "adult community",
  "childless",
  "empty nesters",
  "singles only",
  "bachelor pad",
  "perfect for a family",
  "family-oriented",
  "family oriented",
  // Religion
  "christian family",
  "christian community",
  "muslim family",
  "jewish family",
  "walking distance to church",
  "near the synagogue",
  "near the mosque",
  "church community",
  // National origin / race / color
  "no immigrants",
  "english speakers only",
  "exclusive neighborhood",
  "restricted community",
  "whites only",
  "blacks only",
  // Disability
  "no wheelchairs",
  "able-bodied",
  "able bodied",
  "must be able to climb stairs",
  "no handicap",
  // Sex
  "men only",
  "women only",
  "male tenants only",
  "female tenants only",
  // Age / familial-status proxies
  "mature community",
  "quiet, mature",
  "quiet mature",
  // Source-of-income steering that typically rides along with FH review
  "no section 8",
  "no vouchers",
];

/** Case-insensitive substring scan against the Fair Housing blocklist. */
export function checkFairHousing(text: string): FairHousingCheckResult {
  const lower = (text || "").toLowerCase();
  const matchedPhrases = FAIR_HOUSING_BLOCKLIST.filter((phrase) =>
    lower.includes(phrase),
  );
  return { blocked: matchedPhrases.length > 0, matchedPhrases };
}

export interface GuardrailContext {
  /** The outbound message body/subject+body being considered for send. */
  messageBody: string;
  sendWindow: SendWindow | null | undefined;
  /**
   * True only for the FIRST node of a run enrolled by an inbound-initiated
   * trigger (the lead texted/called/submitted a form first) — per spec,
   * that immediate reply is exempt from quiet hours. Every later node in
   * the same run (after a `wait`, a nurture step, etc.) is outbound-
   * initiated and must NOT set this — quiet hours always apply to those.
   */
  isInboundTriggered: boolean;
  /** Sub-account's configured escalation keywords (falls back to the AI
   *  profile defaults when the caller has none configured). */
  escalationKeywords: string[];
  /** The lead's own inbound text captured at enrollment, when available
   *  (e.g. a form's "message" field). Null when there's nothing to check —
   *  the escalation guard is then a no-op, not a false block. */
  lastInboundMessage?: string | null;
  now?: Date;
}

export type GuardrailOutcome =
  | { allowed: true }
  | { allowed: false; reason: "fair_housing"; matchedPhrases: string[] }
  | { allowed: false; reason: "escalation"; matchedKeyword: string }
  | { allowed: false; reason: "quiet_hours"; deferSeconds: number };

/**
 * Runs a candidate outbound message through all three guardrails, in order:
 * Fair Housing content → escalation keywords → quiet hours (skipped when
 * `isInboundTriggered`). First failing check wins; each carries enough
 * detail for the caller to log *why* a send was blocked/deferred.
 */
export function compileGuardedSend(ctx: GuardrailContext): GuardrailOutcome {
  const fairHousing = checkFairHousing(ctx.messageBody);
  if (fairHousing.blocked) {
    return {
      allowed: false,
      reason: "fair_housing",
      matchedPhrases: fairHousing.matchedPhrases,
    };
  }

  if (ctx.lastInboundMessage) {
    const matched = matchEscalationKeyword(
      ctx.lastInboundMessage,
      ctx.escalationKeywords,
    );
    if (matched) {
      return { allowed: false, reason: "escalation", matchedKeyword: matched };
    }
  }

  if (!ctx.isInboundTriggered) {
    const deferSeconds = secondsUntilSendWindow(
      ctx.sendWindow,
      ctx.now ?? new Date(),
    );
    if (deferSeconds > 0) {
      return { allowed: false, reason: "quiet_hours", deferSeconds };
    }
  }

  return { allowed: true };
}

/** Trigger types that represent the LEAD reaching out first — the inbound-
 *  triggered quiet-hours exemption only ever applies to workflows enrolled
 *  by one of these (and only on the first node of that run). */
export const INBOUND_INITIATED_TRIGGER_TYPES: ReadonlySet<string> = new Set([
  "form.submitted",
  "contact.created",
  "contact.missed_call",
]);
