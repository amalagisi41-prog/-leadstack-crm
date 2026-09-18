import { describe, expect, it } from "vitest";
import {
  deriveStepCompletion,
  EMPTY_ONBOARDING_SIGNALS,
  ownRecordCount,
  summarizeOnboardingCompletion,
  type OnboardingSignals,
} from "./completion";
import { ONBOARDING_STEP_IDS, OPTIONAL_ONBOARDING_STEP_IDS } from "./steps";

/** A workspace where every observable step is genuinely done. */
const FULLY_SET_UP: OnboardingSignals = {
  businessProfileCompletionPct: 100,
  contactCount: 412,
  formCount: 2,
  workflowCount: 1,
  bookingPageCount: 1,
  dealCount: 7,
  campaignBriefCount: 3,
  smsConnected: true,
  aiPersonaSet: true,
  aiChannelEnabled: true,
  customDomainLive: true,
  externalHostRecorded: false,
};

function stepById(signals: OnboardingSignals, attested: string[] = []) {
  return new Map(deriveStepCompletion(signals, attested).map((s) => [s.id, s]));
}

describe("deriveStepCompletion", () => {
  it("covers every canonical step, with no extras", () => {
    const ids = deriveStepCompletion(EMPTY_ONBOARDING_SIGNALS).map((s) => s.id);
    expect(ids).toEqual([...ONBOARDING_STEP_IDS]);
  });

  it("verifies every step for a workspace that really is set up", () => {
    for (const step of deriveStepCompletion(FULLY_SET_UP)) {
      expect(step.evidence, step.id).toBe("verified");
      expect(step.missing, step.id).toBeNull();
    }
  });

  it("names what is missing rather than saying 'incomplete'", () => {
    for (const step of deriveStepCompletion(EMPTY_ONBOARDING_SIGNALS)) {
      expect(step.done, step.id).toBe(false);
      expect(step.missing, step.id).toBeTruthy();
      // "3 items left" tells a first-timer nothing; these must read as nouns.
      expect(step.missing!.length, step.id).toBeGreaterThan(10);
    }
  });

  it("never lets a tick outrank the workspace: attested is not verified", () => {
    // This is the whole point. Ticking a box must not produce evidence.
    const steps = deriveStepCompletion(EMPTY_ONBOARDING_SIGNALS, [
      ...ONBOARDING_STEP_IDS,
    ]);
    for (const step of steps) {
      expect(step.done, step.id).toBe(true);
      expect(step.evidence, step.id).toBe("attested");
      // An attested step still reports what could not be observed.
      expect(step.missing, step.id).toBeTruthy();
    }
  });

  it("prefers the workspace over the tick when both exist", () => {
    const steps = stepById(FULLY_SET_UP, [...ONBOARDING_STEP_IDS]);
    expect(steps.get("contacts")!.evidence).toBe("verified");
  });
});

describe("business profile step", () => {
  it("does not call a half-filled Blueprint done", () => {
    const steps = stepById({
      ...EMPTY_ONBOARDING_SIGNALS,
      businessProfileCompletionPct: 86,
    });
    expect(steps.get("business_profile")!.done).toBe(false);
  });

  it("is done only when every Blueprint fact is present", () => {
    const steps = stepById({
      ...EMPTY_ONBOARDING_SIGNALS,
      businessProfileCompletionPct: 100,
    });
    expect(steps.get("business_profile")!.evidence).toBe("verified");
  });
});

describe("domain step", () => {
  it("counts a verified custom domain", () => {
    const steps = stepById({
      ...EMPTY_ONBOARDING_SIGNALS,
      customDomainLive: true,
    });
    expect(steps.get("domain")!.evidence).toBe("verified");
  });

  it("counts a recorded external host for a client keeping their own site", () => {
    // A client staying on their existing website has nothing to point at us.
    // Requiring a custom domain would leave them permanently incomplete
    // through no fault of their own.
    const steps = stepById({
      ...EMPTY_ONBOARDING_SIGNALS,
      externalHostRecorded: true,
    });
    expect(steps.get("domain")!.evidence).toBe("verified");
  });

  it("is not done when we know neither", () => {
    expect(stepById(EMPTY_ONBOARDING_SIGNALS).get("domain")!.done).toBe(false);
  });
});

describe("ai step", () => {
  it("needs both a persona and somewhere it is switched on", () => {
    // A persona nobody can reach has not been set up.
    const personaOnly = stepById({
      ...EMPTY_ONBOARDING_SIGNALS,
      aiPersonaSet: true,
    });
    expect(personaOnly.get("ai")!.done).toBe(false);

    const channelOnly = stepById({
      ...EMPTY_ONBOARDING_SIGNALS,
      aiChannelEnabled: true,
    });
    expect(channelOnly.get("ai")!.done).toBe(false);
  });
});

describe("summarizeOnboardingCompletion", () => {
  it("only calls a workspace fully configured on observed evidence", () => {
    expect(summarizeOnboardingCompletion(FULLY_SET_UP).fullyVerified).toBe(
      true
    );
  });

  it("refuses 'fully configured' when the required steps are only ticked", () => {
    const summary = summarizeOnboardingCompletion(EMPTY_ONBOARDING_SIGNALS, [
      ...ONBOARDING_STEP_IDS,
    ]);
    expect(summary.fullyVerified).toBe(false);
    // Ticks still count as done for the progress bar, so a user who marked
    // their own progress does not see it wiped.
    expect(summary.doneStepIds).toEqual([...ONBOARDING_STEP_IDS]);
    expect(summary.attestedStepIds).toEqual([...ONBOARDING_STEP_IDS]);
  });

  it("ignores optional steps when deciding whether setup is finished", () => {
    // A2P registration takes weeks and IDX depends on a broker; neither may
    // hold a workspace short of "set up".
    const noOptionals: OnboardingSignals = {
      ...FULLY_SET_UP,
      smsConnected: false,
      aiPersonaSet: false,
      aiChannelEnabled: false,
      campaignBriefCount: 0,
    };
    const summary = summarizeOnboardingCompletion(noOptionals);
    expect(summary.fullyVerified).toBe(true);
    expect(summary.outstanding).toEqual([]);
    for (const id of OPTIONAL_ONBOARDING_STEP_IDS) {
      expect(summary.doneStepIds).not.toContain(id);
    }
  });

  it("lists outstanding required work by name", () => {
    const summary = summarizeOnboardingCompletion({
      ...FULLY_SET_UP,
      contactCount: 0,
      formCount: 0,
    });
    expect(summary.fullyVerified).toBe(false);
    expect(summary.outstanding.map((s) => s.id).sort()).toEqual([
      "contacts",
      "form",
    ]);
    expect(summary.outstanding[0].missing).toBeTruthy();
  });

  it("does not list an attested step as outstanding", () => {
    const summary = summarizeOnboardingCompletion(
      { ...FULLY_SET_UP, contactCount: 0 },
      ["contacts"]
    );
    expect(summary.outstanding).toEqual([]);
    // …but it still is not evidence, so setup is not finished.
    expect(summary.fullyVerified).toBe(false);
  });
});

describe("ownRecordCount", () => {
  it("subtracts the seeded example from the total", () => {
    expect(ownRecordCount(7, 5)).toBe(2);
  });

  it("reports zero for a workspace holding only the example", () => {
    expect(ownRecordCount(5, 5)).toBe(0);
  });

  it("returns zero when EITHER read failed, never the raw total", () => {
    // A missing composite index makes the sample count unavailable. Falling
    // back to the total there would count the example as the client's work and
    // tell every new workspace it had already done it — a false "you're done",
    // which is the one error this whole model exists to prevent.
    expect(ownRecordCount(5, null)).toBe(0);
    expect(ownRecordCount(null, 5)).toBe(0);
    expect(ownRecordCount(null, null)).toBe(0);
  });

  it("never goes negative if the sample count outruns the total", () => {
    // Possible mid-delete, when the two aggregations disagree by a moment.
    expect(ownRecordCount(2, 5)).toBe(0);
  });
});
