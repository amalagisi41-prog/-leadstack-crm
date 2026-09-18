import {
  summarizeOnboardingCompletion,
  type OnboardingSignals,
  type StepCompletion,
} from "./completion";

/**
 * How far a workspace has actually got, plus how long the parts we can time
 * took.
 *
 * This used to decide completeness from an event log. It required eight
 * events; only three were ever emitted anywhere in the codebase
 * (`trusted_preview`, `release_approved`, `published`, all from Website
 * Studio), so `complete` was structurally incapable of being true — for every
 * client, on both journeys. Worse, the `existing_brand` journey demanded
 * `published`, which a client keeping their own website will never do, so the
 * one profile it was named for was the one it could never pass.
 *
 * Completeness now comes from `completion.ts` — the same derivation the setup
 * checklist shows, so the two surfaces cannot disagree about whether a client
 * is set up. The event log stays for what it is genuinely good at: timing, and
 * counting the times someone got stuck. Those events really are emitted, and
 * an absent one now costs a timing figure rather than silently withholding
 * "done".
 */

export type OnboardingJourney = "new_business" | "existing_brand";

export type JourneyEventName =
  | "journey_started"
  | "identity_completed"
  | "preset_selected"
  | "existing_site_verified"
  | "trusted_preview"
  | "lead_path_connected"
  | "domain_ready"
  | "release_approved"
  | "published"
  | "blocked"
  | "support_requested"
  | "rollback";

export type JourneyEvent = {
  name: JourneyEventName;
  atMs: number;
  detail?: string;
};

export interface OnboardingJourneyEvaluation {
  journey: OnboardingJourney;
  /** Every required step observed in the workspace. */
  complete: boolean;
  /** Required steps still outstanding, each naming what is missing. */
  missing: StepCompletion[];
  /** Done on the operator's say-so only — reported, never counted as evidence. */
  attestedStepIds: string[];
  blockedCount: number;
  supportRequestCount: number;
  rollbackCount: number;
  timeToTrustworthyPreviewMs: number | null;
  timeToPublishMs: number | null;
}

export function evaluateOnboardingJourney(
  journey: OnboardingJourney,
  events: JourneyEvent[],
  signals: OnboardingSignals,
  attestedStepIds: readonly string[] = []
): OnboardingJourneyEvaluation {
  const ordered = [...events].sort((a, b) => a.atMs - b.atMs);
  const at = (name: JourneyEventName) =>
    ordered.find((event) => event.name === name)?.atMs;
  const count = (name: JourneyEventName) =>
    ordered.filter((event) => event.name === name).length;

  const started = at("journey_started");
  const preview = at("trusted_preview");
  const published = at("published");
  const summary = summarizeOnboardingCompletion(signals, attestedStepIds);

  return {
    journey,
    complete: summary.fullyVerified,
    missing: summary.outstanding,
    attestedStepIds: summary.attestedStepIds,
    blockedCount: count("blocked"),
    supportRequestCount: count("support_requested"),
    rollbackCount: count("rollback"),
    timeToTrustworthyPreviewMs:
      started !== undefined && preview !== undefined ? preview - started : null,
    timeToPublishMs:
      started !== undefined && published !== undefined
        ? published - started
        : null,
  };
}
