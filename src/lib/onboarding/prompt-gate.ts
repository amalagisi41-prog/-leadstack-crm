/**
 * When an onboarding modal may open on its own.
 *
 * The setup pop-up used to re-open on every page navigation until the step
 * behind it was done, so closing it bought nothing. The rule now:
 *
 * - at most ONE onboarding modal opens on its own per browser session;
 * - closing it (the X, "Skip", clicking outside) means "not now": it stays
 *   closed for the rest of the session AND for 7 days after, per user;
 * - once onboarding is complete it never opens on its own again.
 *
 * Opening a modal by hand (the setup pill, the hub) is never gated.
 *
 * Pure so the rule is testable without a browser; the storage side lives in
 * prompt-gate-storage.ts.
 */

export const ONBOARDING_PROMPT_SUPPRESS_MS = 7 * 24 * 60 * 60 * 1000;

export interface PromptGateState {
  /** An onboarding modal already opened on its own in this session. */
  shownThisSession: boolean;
  /** Epoch ms of the last "not now", or null. */
  dismissedAt: number | null;
  /** Epoch ms onboarding was completed, or null. */
  completedAt: number | null;
}

export function canAutoOpenOnboardingPrompt(state: PromptGateState, now: number): boolean {
  if (state.completedAt) return false;
  if (state.shownThisSession) return false;
  if (state.dismissedAt && now - state.dismissedAt < ONBOARDING_PROMPT_SUPPRESS_MS) return false;
  return true;
}

/**
 * Whether onboarding is out of the way, so lower-priority prompts (the
 * "Put AgentStack on your phone" install modal) may appear: the user has
 * completed onboarding or said "not now" to it.
 */
export function onboardingSettled(state: Pick<PromptGateState, "dismissedAt" | "completedAt">): boolean {
  return Boolean(state.completedAt || state.dismissedAt);
}
