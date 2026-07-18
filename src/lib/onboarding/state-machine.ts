import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_IDS,
  type OnboardingStepId,
} from "./steps";

/**
 * Pure state machine over the 8 canonical onboarding-checklist step ids
 * (lib/onboarding/steps.ts). No I/O — safe to import from both the
 * server-only API route and client components, and unit-testable directly.
 *
 * Maps each of the 6 "AgentStack Method" wizard screens
 * (components/dashboard/onboarding-wizard.tsx) to the checklist step ids it
 * marks done — kept here as a single source of truth so the wizard's screen
 * order and this state machine can't silently drift apart. Mirrors the
 * `advance([...])` calls inside the wizard component exactly.
 */
export const WIZARD_STEP_STEP_IDS: readonly (readonly OnboardingStepId[])[] = [
  ["business_profile"], // 0 — Build
  ["contacts", "sms"], // 1 — Connect
  ["form"], // 2 — Capture
  ["automation", "ai"], // 3 — Respond
  ["pipeline"], // 4 — Nurture
  ["domain"], // 5 — Close (the one step id with no earlier screen)
];

export interface OnboardingRecommendedAction {
  id: OnboardingStepId;
  title: string;
  cta: string;
  href: string;
}

export interface OnboardingState {
  completedStepIds: OnboardingStepId[];
  totalSteps: number;
  completedCount: number;
  isComplete: boolean;
  /** Index (0-5) of the first wizard screen with an incomplete step id, or
   *  null once every step id is complete. Lets the wizard resume where a
   *  user left off instead of always restarting at screen 0. */
  nextWizardStepIndex: number | null;
  /** The first not-yet-complete checklist step, in canonical order — the
   *  single "what should I do next" answer for any onboarding surface. */
  nextRecommendedAction: OnboardingRecommendedAction | null;
}

export function computeOnboardingState(
  completed: readonly string[] | null | undefined,
): OnboardingState {
  const completedSet = new Set(completed ?? []);
  const completedStepIds = ONBOARDING_STEP_IDS.filter((id) =>
    completedSet.has(id),
  );
  const isComplete = completedStepIds.length === ONBOARDING_STEP_IDS.length;

  // Both derived from the same scan so they can never disagree — e.g. the
  // wizard resuming at screen 3 ("Respond") while nextRecommendedAction
  // points at a later screen's step id would be a confusing contradiction.
  let nextWizardStepIndex: number | null = null;
  let nextStepId: OnboardingStepId | null = null;
  for (let i = 0; i < WIZARD_STEP_STEP_IDS.length; i++) {
    const missing = WIZARD_STEP_STEP_IDS[i].find((id) => !completedSet.has(id));
    if (missing) {
      nextWizardStepIndex = i;
      nextStepId = missing;
      break;
    }
  }

  const nextStep = nextStepId
    ? ONBOARDING_STEPS.find((s) => s.id === nextStepId)
    : undefined;

  return {
    completedStepIds,
    totalSteps: ONBOARDING_STEP_IDS.length,
    completedCount: completedStepIds.length,
    isComplete,
    nextWizardStepIndex,
    nextRecommendedAction: nextStep
      ? { id: nextStep.id, title: nextStep.title, cta: nextStep.cta, href: nextStep.href }
      : null,
  };
}
