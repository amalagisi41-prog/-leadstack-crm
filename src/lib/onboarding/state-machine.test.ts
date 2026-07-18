import { describe, it, expect } from "vitest";
import { computeOnboardingState } from "./state-machine";
import { ONBOARDING_STEP_IDS } from "./steps";

describe("computeOnboardingState", () => {
  it("nothing completed — starts at wizard screen 0 with business_profile next", () => {
    const state = computeOnboardingState([]);
    expect(state.completedCount).toBe(0);
    expect(state.isComplete).toBe(false);
    expect(state.nextWizardStepIndex).toBe(0);
    expect(state.nextRecommendedAction?.id).toBe("business_profile");
  });

  it("null/undefined completed list behaves the same as empty", () => {
    expect(computeOnboardingState(null).nextWizardStepIndex).toBe(0);
    expect(computeOnboardingState(undefined).nextWizardStepIndex).toBe(0);
  });

  it("resumes at the correct wizard screen for a partially-completed run", () => {
    // Build + half of Connect done (contacts but not sms yet) — should
    // resume at screen 1 (Connect), not restart from 0.
    const state = computeOnboardingState(["business_profile", "contacts"]);
    expect(state.nextWizardStepIndex).toBe(1);
    expect(state.nextRecommendedAction?.id).toBe("sms");
  });

  it("a multi-step-id screen only advances once BOTH its step ids are done", () => {
    // "automation" done but not "ai" — Respond (screen 3) isn't complete yet.
    const state = computeOnboardingState([
      "business_profile",
      "contacts",
      "sms",
      "form",
      "automation",
    ]);
    expect(state.nextWizardStepIndex).toBe(3);
    expect(state.nextRecommendedAction?.id).toBe("ai");
  });

  it("only the trailing domain step left — resumes at the Close screen", () => {
    const allButDomain = ONBOARDING_STEP_IDS.filter((id) => id !== "domain");
    const state = computeOnboardingState(allButDomain);
    expect(state.nextWizardStepIndex).toBe(5);
    expect(state.nextRecommendedAction?.id).toBe("domain");
    expect(state.isComplete).toBe(false);
  });

  it("every step complete — isComplete true, no next action, no next screen", () => {
    const state = computeOnboardingState(ONBOARDING_STEP_IDS);
    expect(state.isComplete).toBe(true);
    expect(state.completedCount).toBe(state.totalSteps);
    expect(state.nextWizardStepIndex).toBeNull();
    expect(state.nextRecommendedAction).toBeNull();
  });

  it("unknown step ids in the persisted list are ignored, not counted", () => {
    const state = computeOnboardingState(["business_profile", "not_a_real_step"]);
    expect(state.completedCount).toBe(1);
    expect(state.completedStepIds).toEqual(["business_profile"]);
  });
});
