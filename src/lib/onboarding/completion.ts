import {
  OPTIONAL_ONBOARDING_STEP_IDS,
  ONBOARDING_STEP_IDS,
  type OnboardingStepId,
} from "./steps";

/**
 * Onboarding completion, derived from what the workspace actually contains.
 *
 * Setup progress used to be a checkbox. Ticking four boxes produced "You're
 * all set! Your account is fully configured" with nothing connected and no
 * record of who claimed otherwise — the exact failure CLAUDE.md's "never mark
 * work complete that the user did not do" rule exists to prevent, in the
 * surface an agency relies on to know whether a client is actually live.
 *
 * Every step below is derivable, so every step is derived. The stored ticks
 * are not thrown away — a step a user ticked but that cannot be observed is
 * reported as `attested` and labelled as their claim, never counted as
 * verified. Only verified steps make a workspace "fully configured".
 */

/**
 * Facts the app can read for itself. Nothing here is the operator's say-so,
 * which is the entire point — a signal that could only be self-reported does
 * not belong in this interface.
 */
export interface OnboardingSignals {
  /** `businessProfileCompleteness()`, 0-100. */
  businessProfileCompletionPct: number;
  contactCount: number;
  formCount: number;
  workflowCount: number;
  bookingPageCount: number;
  dealCount: number;
  campaignBriefCount: number;
  /** The sub-account's own Twilio number is configured. */
  smsConnected: boolean;
  /** The shared AI persona prompt is non-empty. */
  aiPersonaSet: boolean;
  /** At least one AI channel is switched on. */
  aiChannelEnabled: boolean;
  /** A custom domain that this deployment has verified end to end. */
  customDomainLive: boolean;
  /**
   * The operator told us who hosts the website they are keeping. This counts
   * for the domain step: a client staying on their existing site has nothing
   * to point at us, and a step they can never finish would sit incomplete
   * forever through no fault of theirs.
   */
  externalHostRecorded: boolean;
}

/** All seven `businessProfileCompleteness()` checks are basic business facts, so
 *  anything short of all of them is a half-filled profile, not a finished one. */
export const BUSINESS_PROFILE_DONE_PCT = 100;

export type StepEvidence =
  /** Observed in the workspace. */
  | "verified"
  /** A user ticked it; nothing in the workspace confirms it. */
  | "attested"
  | "none";

export interface StepCompletion {
  id: OnboardingStepId;
  done: boolean;
  evidence: StepEvidence;
  /**
   * What is missing, named. "Locked" and "3 items left" tell a first-timer
   * nothing; "No contacts imported yet" tells them where to go.
   */
  missing: string | null;
}

/** One observable test per step, with the wording used when it fails. */
const RULES: Record<
  OnboardingStepId,
  { met: (s: OnboardingSignals) => boolean; missing: string }
> = {
  business_profile: {
    met: (s) => s.businessProfileCompletionPct >= BUSINESS_PROFILE_DONE_PCT,
    missing: "Your Business Blueprint still has blank fields",
  },
  contacts: {
    met: (s) => s.contactCount > 0,
    missing: "No contacts imported yet",
  },
  lseo: {
    met: (s) => s.campaignBriefCount > 0,
    missing: "No property campaign started yet",
  },
  sms: {
    met: (s) => s.smsConnected,
    missing: "No texting number connected",
  },
  form: {
    met: (s) => s.formCount > 0,
    missing: "No lead capture form built yet",
  },
  automation: {
    met: (s) => s.workflowCount > 0,
    missing: "No follow-up plan set up yet",
  },
  booking: {
    met: (s) => s.bookingPageCount > 0,
    missing: "No booking page created yet",
  },
  pipeline: {
    met: (s) => s.dealCount > 0,
    missing: "No deals in your pipeline yet",
  },
  ai: {
    met: (s) => s.aiPersonaSet && s.aiChannelEnabled,
    missing: "Your AI agent has no persona or is switched off everywhere",
  },
  domain: {
    met: (s) => s.customDomainLive || s.externalHostRecorded,
    missing: "We don't know where your website lives yet",
  },
};

export function deriveStepCompletion(
  signals: OnboardingSignals,
  attestedStepIds: readonly string[] = []
): StepCompletion[] {
  const attested = new Set(attestedStepIds);
  return ONBOARDING_STEP_IDS.map((id) => {
    const rule = RULES[id];
    if (rule.met(signals))
      return { id, done: true, evidence: "verified" as const, missing: null };
    if (attested.has(id))
      return {
        id,
        done: true,
        evidence: "attested" as const,
        missing: rule.missing,
      };
    return {
      id,
      done: false,
      evidence: "none" as const,
      missing: rule.missing,
    };
  });
}

export interface OnboardingCompletionSummary {
  steps: StepCompletion[];
  /** Ids counted as done, verified or attested — what the checklist ticks. */
  doneStepIds: OnboardingStepId[];
  verifiedStepIds: OnboardingStepId[];
  attestedStepIds: OnboardingStepId[];
  /**
   * Every REQUIRED step observed in the workspace. The only state that earns
   * "fully configured" — an attested step is someone's word, not evidence.
   */
  fullyVerified: boolean;
  /** Required steps that are neither verified nor attested, named. */
  outstanding: StepCompletion[];
}

export function summarizeOnboardingCompletion(
  signals: OnboardingSignals,
  attestedStepIds: readonly string[] = []
): OnboardingCompletionSummary {
  const steps = deriveStepCompletion(signals, attestedStepIds);
  const optional = new Set<string>(OPTIONAL_ONBOARDING_STEP_IDS);
  const required = steps.filter((s) => !optional.has(s.id));
  return {
    steps,
    doneStepIds: steps.filter((s) => s.done).map((s) => s.id),
    verifiedStepIds: steps
      .filter((s) => s.evidence === "verified")
      .map((s) => s.id),
    attestedStepIds: steps
      .filter((s) => s.evidence === "attested")
      .map((s) => s.id),
    fullyVerified: required.every((s) => s.evidence === "verified"),
    outstanding: required.filter((s) => !s.done),
  };
}

/** Signals for a workspace we could not read — nothing observed, nothing claimed. */
export const EMPTY_ONBOARDING_SIGNALS: OnboardingSignals = {
  businessProfileCompletionPct: 0,
  contactCount: 0,
  formCount: 0,
  workflowCount: 0,
  bookingPageCount: 0,
  dealCount: 0,
  campaignBriefCount: 0,
  smsConnected: false,
  aiPersonaSet: false,
  aiChannelEnabled: false,
  customDomainLive: false,
  externalHostRecorded: false,
};

/**
 * The client's own record count: total minus the seeded example.
 *
 * `null` for either input means that read FAILED, and the answer is zero
 * rather than a guess. Returning `total` when the sample count is unavailable
 * — which is what a missing composite index produces — would count the
 * worked example as the client's own work and tell every new workspace it had
 * already imported contacts and built a pipeline. Zero errs the other way: a
 * client is shown work they have in fact done, which is visibly wrong to them
 * and which a reload fixes. Only one of those is a false "you're done".
 */
export function ownRecordCount(
  total: number | null,
  samples: number | null
): number {
  if (total === null || samples === null) return 0;
  return Math.max(0, total - samples);
}
