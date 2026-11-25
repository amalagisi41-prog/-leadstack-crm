import { describe, expect, it } from "vitest";
import {
  canAutoOpenOnboardingPrompt,
  onboardingSettled,
  ONBOARDING_PROMPT_SUPPRESS_MS,
} from "./prompt-gate";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 25);
const fresh = { shownThisSession: false, dismissedAt: null, completedAt: null };

describe("onboarding prompt gate", () => {
  it("opens on its own for a new user", () => {
    expect(canAutoOpenOnboardingPrompt(fresh, now)).toBe(true);
  });

  it("opens at most once per session: never again on navigation after it has shown", () => {
    expect(canAutoOpenOnboardingPrompt({ ...fresh, shownThisSession: true }, now)).toBe(false);
  });

  it("stays closed after 'not now' — this session and for 7 days in later sessions", () => {
    const dismissedAt = now;
    // Same session: the dismissal also marks the session as shown.
    expect(canAutoOpenOnboardingPrompt({ shownThisSession: true, dismissedAt, completedAt: null }, now + 1000)).toBe(false);
    // New sessions within 7 days.
    for (const days of [1, 3, 6.9]) {
      expect(canAutoOpenOnboardingPrompt({ ...fresh, dismissedAt }, now + days * DAY)).toBe(false);
    }
  });

  it("may open again in a new session once the 7-day suppression has passed", () => {
    expect(ONBOARDING_PROMPT_SUPPRESS_MS).toBe(7 * DAY);
    expect(canAutoOpenOnboardingPrompt({ ...fresh, dismissedAt: now }, now + 7 * DAY)).toBe(true);
  });

  it("never opens on its own once onboarding is complete", () => {
    expect(canAutoOpenOnboardingPrompt({ ...fresh, completedAt: now }, now + 365 * DAY)).toBe(false);
  });

  it("treats onboarding as settled (install prompt may follow) only after completion or dismissal", () => {
    expect(onboardingSettled(fresh)).toBe(false);
    expect(onboardingSettled({ dismissedAt: now, completedAt: null })).toBe(true);
    expect(onboardingSettled({ dismissedAt: null, completedAt: now })).toBe(true);
  });
});
