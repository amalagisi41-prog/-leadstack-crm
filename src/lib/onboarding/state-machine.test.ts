import { describe, it, expect } from "vitest";
import {
  WIZARD_STEP_STEP_IDS,
  computeOnboardingState,
} from "./state-machine";
import {
  isOnboardingLaunchReady,
  ONBOARDING_STEPS,
  ONBOARDING_STEP_IDS,
  REQUIRED_ONBOARDING_STEP_IDS,
} from "./steps";

/**
 * The guided path from 0% to 100%, walked the way a first-time agent walks
 * it — one screen at a time, sometimes skipping, sometimes stopping halfway
 * and coming back tomorrow.
 *
 * These expectations changed when the wizard's screen→step mapping was
 * corrected. Screen 0 is titled "Confirm your domain and hosting foundation"
 * but used to mark `business_profile`, and screen 1 (the Business Blueprint)
 * used to mark `contacts` and `sms`. Finishing marked all eight ids outright,
 * so an agent who skipped the whole wizard was told they were complete, with
 * a checklist claiming they had imported contacts and connected a phone
 * number they had never touched. For someone who has never used a CRM, a
 * false "you're done" is worse than no guidance at all — nothing is left on
 * screen to tell them what is missing.
 */

/** Walk the wizard, marking each screen's ids the way `advance` does. */
function clickThrough(screens: number[]): string[] {
  return screens.flatMap((index) => [...WIZARD_STEP_STEP_IDS[index]]);
}

describe("the wizard maps to the work it actually shows", () => {
  it("covers every checklist step across its six screens", () => {
    const covered = WIZARD_STEP_STEP_IDS.flat();
    expect([...covered].sort()).toEqual([...ONBOARDING_STEP_IDS].sort());
  });

  it("never claims the same step on two screens", () => {
    const covered = WIZARD_STEP_STEP_IDS.flat();
    expect(new Set(covered).size).toBe(covered.length);
  });

  it("starts with the domain, which is what screen one asks for", () => {
    expect(WIZARD_STEP_STEP_IDS[0]).toEqual(["domain"]);
    expect(WIZARD_STEP_STEP_IDS[1]).toEqual(["business_profile"]);
  });

  it("keeps the link-out tasks on the final screen", () => {
    // The wizard only links out for these two, so clicking Next never
    // completes them. Placing them last means an unfinished agent resumes on
    // the screen that names them.
    expect(WIZARD_STEP_STEP_IDS[5]).toEqual(["contacts", "sms", "booking"]);
  });
});

describe("situation: brand-new agent who does every step", () => {
  it("moves through the screens in order, reaching 100%", () => {
    let completed: string[] = [];
    for (let screen = 0; screen < WIZARD_STEP_STEP_IDS.length; screen++) {
      expect(computeOnboardingState(completed).nextWizardStepIndex).toBe(
        screen
      );
      completed = [...completed, ...WIZARD_STEP_STEP_IDS[screen]];
    }

    const final = computeOnboardingState(completed);
    expect(final.isComplete).toBe(true);
    expect(final.completedCount).toBe(final.totalSteps);
    expect(final.nextWizardStepIndex).toBeNull();
    expect(final.nextRecommendedAction).toBeNull();
  });

  it("always names one concrete next action until it is finished", () => {
    let completed: string[] = [];
    for (let screen = 0; screen < WIZARD_STEP_STEP_IDS.length; screen++) {
      const action = computeOnboardingState(completed).nextRecommendedAction;
      // Never a dead end: an agent with no CRM experience is always told the
      // next thing by name, with somewhere to click.
      expect(action).not.toBeNull();
      expect(action!.title.length).toBeGreaterThan(0);
      expect(action!.cta.length).toBeGreaterThan(0);
      expect(action!.href.startsWith("/")).toBe(true);
      completed = [...completed, ...WIZARD_STEP_STEP_IDS[screen]];
    }
  });
});

describe("situation: agent who skips screens", () => {
  it("does NOT mark a skipped screen complete", () => {
    // Skipping is not doing. `onSkip` used to mark the ids anyway, which is
    // how an agent reached "complete" having done nothing.
    const state = computeOnboardingState(clickThrough([0, 1, 3, 4]));

    expect(state.isComplete).toBe(false);
    expect(state.completedStepIds).not.toContain("form");
    expect(state.nextRecommendedAction?.id).toBe("form");
  });

  it("sends the agent back to the earliest thing they skipped", () => {
    const state = computeOnboardingState(clickThrough([0, 2, 3, 4, 5]));
    expect(state.nextWizardStepIndex).toBe(1);
    expect(state.nextRecommendedAction?.id).toBe("business_profile");
  });

  it("reaches 100% only when the skipped work is genuinely done", () => {
    const skipped = clickThrough([0, 1, 3, 4, 5]);
    expect(computeOnboardingState(skipped).isComplete).toBe(false);
    expect(computeOnboardingState([...skipped, "form"]).isComplete).toBe(true);
  });
});

describe("situation: agent who clicks Finish without doing anything", () => {
  it("is not reported as complete", () => {
    const state = computeOnboardingState([]);
    expect(state.isComplete).toBe(false);
    expect(state.completedCount).toBe(0);
    expect(state.nextWizardStepIndex).toBe(0);
    expect(state.nextRecommendedAction?.id).toBe("domain");
  });

  it("still has every step listed with somewhere to go", () => {
    const state = computeOnboardingState([]);
    const outstanding = ONBOARDING_STEPS.filter(
      (step) => !state.completedStepIds.includes(step.id)
    );

    expect(outstanding).toHaveLength(ONBOARDING_STEP_IDS.length);
    for (const step of outstanding) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.cta.length).toBeGreaterThan(0);
      expect(step.href.startsWith("/")).toBe(true);
    }
  });
});

describe("situation: agent who leaves and comes back", () => {
  it("resumes where they stopped rather than restarting", () => {
    expect(
      computeOnboardingState(clickThrough([0, 1, 2])).nextWizardStepIndex
    ).toBe(3);
  });

  it("holds a multi-step screen until BOTH its ids are done", () => {
    // "automation" done but not "ai" — the AI Response screen isn't finished.
    const state = computeOnboardingState([
      ...clickThrough([0, 1, 2]),
      "automation",
    ]);
    expect(state.nextWizardStepIndex).toBe(3);
    expect(state.nextRecommendedAction?.id).toBe("ai");
  });

  it("sends Speed-to-Lead setup to the canonical Follow-Up Plans route", () => {
    const state = computeOnboardingState(clickThrough([0, 1, 2]));
    expect(state.nextRecommendedAction?.id).toBe("automation");
    expect(state.nextRecommendedAction?.href).toBe("/workflows");
  });

  it("sends phone setup to the Messaging settings tab", () => {
    const state = computeOnboardingState(clickThrough([0, 1, 2, 3, 4, 5]));
    expect(state.nextRecommendedAction).toBeNull();
    expect(ONBOARDING_STEPS.find((step) => step.id === "sms")?.href).toBe(
      "/dashboard/settings?tab=messaging",
    );
  });

  it("treats a missing record as a fresh start rather than crashing", () => {
    for (const input of [null, undefined, []]) {
      const state = computeOnboardingState(input);
      expect(state.completedCount).toBe(0);
      expect(state.nextWizardStepIndex).toBe(0);
    }
  });

  it("ignores an unknown id left by an older build", () => {
    const state = computeOnboardingState(["domain", "not_a_real_step"]);
    expect(state.completedCount).toBe(1);
    expect(state.completedStepIds).toEqual(["domain"]);
  });
});

describe("launch readiness", () => {
  it("does not block a workspace on SMS/A2P or AI persona setup", () => {
    expect(isOnboardingLaunchReady(REQUIRED_ONBOARDING_STEP_IDS)).toBe(true);
    expect(isOnboardingLaunchReady(["domain", "business_profile"])).toBe(
      false,
    );
  });

  it("still requires the operational launch baseline", () => {
    const missingBooking = REQUIRED_ONBOARDING_STEP_IDS.filter(
      (id) => id !== "booking",
    );
    expect(isOnboardingLaunchReady(missingBooking)).toBe(false);
  });
});

describe("situation: agent who did the work outside the wizard", () => {
  it("counts it and moves them past that screen", () => {
    // Someone who connected their domain from the sidebar before ever opening
    // the wizard should not be walked through it again.
    const state = computeOnboardingState(["domain"]);
    expect(state.nextWizardStepIndex).toBe(1);
    expect(state.completedStepIds).toEqual(["domain"]);
  });

  it("recognises a fully self-served agent as complete", () => {
    const state = computeOnboardingState(ONBOARDING_STEP_IDS);
    expect(state.isComplete).toBe(true);
    expect(state.nextWizardStepIndex).toBeNull();
  });

  it("resumes on the final screen when only contacts and phone remain", () => {
    const allButLast = ONBOARDING_STEP_IDS.filter(
      (id) => id !== "contacts" && id !== "sms"
    );
    const state = computeOnboardingState(allButLast);
    expect(state.nextWizardStepIndex).toBe(5);
    expect(state.nextRecommendedAction?.id).toBe("contacts");
    expect(state.isComplete).toBe(false);
  });
});

describe("every step is answerable without prior knowledge", () => {
  it("explains what it is and where it goes", () => {
    for (const step of ONBOARDING_STEPS) {
      // A bare label ("SMS", "A2P") means nothing to a first-timer, so each
      // step carries its own explanation and destination.
      expect(step.description.split(" ").length).toBeGreaterThan(8);
      expect(step.cta).not.toBe("");
      expect(step.href).toMatch(/^\//);
      expect(step.videoMinutes).toBeGreaterThan(0);
    }
  });
});
