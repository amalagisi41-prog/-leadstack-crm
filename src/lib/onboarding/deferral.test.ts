import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, type OnboardingStepId } from "./steps";
import {
  OPTIONAL_CONNECTIONS,
  blockingSteps,
  canFinishSetup,
  connectionDeferral,
  deferralFor,
  isDeferrable,
} from "./deferral";

/**
 * The failure this prevents is a stalled setup, which is a churned customer.
 *
 * A checklist that presents every step as required turns a twenty-minute setup
 * into a fortnight. An agent with no Instagram sits on a step they can never
 * complete. An agent waiting on A2P carrier registration — weeks, and entirely
 * out of their hands — cannot tick the SMS step however keen they are. Both
 * stall.
 */

describe("what actually has to be done", () => {
  it("blocks on the business profile and nothing else", () => {
    // Everything reads from it; generating without it produces filler with the
    // operator's name on it.
    expect(blockingSteps().map((s) => s.id)).toEqual(["business_profile"]);
  });

  it("lets every other step wait", () => {
    for (const step of ONBOARDING_STEPS) {
      if (step.id === "business_profile") continue;
      expect(isDeferrable(step.id), step.id).toBe(true);
    }
  });

  it("covers every step in the checklist, with none missed", () => {
    // A step added to ONBOARDING_STEPS without a deferral decision would
    // silently default to looking required.
    for (const step of ONBOARDING_STEPS) {
      const deferral = deferralFor(step.id);
      expect(deferral.deferral, step.id).toBeTruthy();
    }
  });
});

describe("what a skip has to tell the operator", () => {
  const deferrable = ONBOARDING_STEPS.map((s) => deferralFor(s.id)).filter(
    (s) => s.deferral === "deferrable"
  );

  it("names what they give up", () => {
    for (const step of deferrable) {
      expect(step.cost.trim().length, step.id).toBeGreaterThan(20);
    }
  });

  it("names what would bring them back", () => {
    // Without this the step is dismissed rather than deferred, and never
    // revisited.
    for (const step of deferrable) {
      expect(step.returnWhen.trim().length, step.id).toBeGreaterThan(20);
    }
  });

  it("never labels the control 'skip'", () => {
    // "Skip" reads as failing the step. The label should describe the choice.
    for (const step of deferrable) {
      expect(step.skipLabel.trim().length, step.id).toBeGreaterThan(5);
      expect(step.skipLabel.toLowerCase(), step.id).not.toMatch(/^skip\b/);
    }
  });

  it("explains the one thing that cannot wait", () => {
    const profile = deferralFor("business_profile");
    expect(profile.blockingReason).toMatch(/template with your name on it/i);
    // And offers no skip control at all.
    expect(profile.skipLabel).toBe("");
  });

  it("tells an operator waiting on carrier registration to carry on", () => {
    // A2P takes weeks and is out of their hands. Presenting it as outstanding
    // work stalls the whole setup behind something they cannot influence.
    const sms = deferralFor("sms");
    expect(sms.returnWhen).toMatch(/few weeks|out of your hands/i);
    expect(sms.returnWhen).toMatch(/carry on with everything else/i);
  });
});

describe("connections the operator may simply not have", () => {
  it("treats every one of them as optional", () => {
    for (const id of OPTIONAL_CONNECTIONS) {
      const connection = connectionDeferral(id);
      expect(connection.skipLabel.trim().length, id).toBeGreaterThan(3);
      expect(connection.cost.trim().length, id).toBeGreaterThan(20);
    }
  });

  it("lets someone say they do not use a network, rather than defer it", () => {
    // An agent with no Instagram cannot be guided into having one. "Later"
    // would leave a permanent unclearable item on their list.
    expect(connectionDeferral("instagram").skipLabel).toMatch(/don't use/i);
    expect(connectionDeferral("facebook").skipLabel).toMatch(/don't use/i);
  });

  it("is honest that LinkedIn cannot be connected at all yet", () => {
    // SocialPlatform publishes to Meta only. A connect button here would be a
    // promise nothing keeps.
    const linkedin = connectionDeferral("linkedin");
    expect(linkedin.availableToConnect).toBe(false);
    expect(linkedin.cost).toMatch(/cannot post to LinkedIn yet/i);
    // And still offers something useful rather than a dead end.
    expect(linkedin.cost).toMatch(/write posts here and paste them across/i);
  });

  it("marks the connections that do work as connectable", () => {
    for (const id of OPTIONAL_CONNECTIONS) {
      if (id === "linkedin") continue;
      expect(connectionDeferral(id).availableToConnect, id).toBe(true);
    }
  });
});

describe("finishing setup", () => {
  it("lets an operator finish with only their profile done", () => {
    // The whole point: a working product in one sitting.
    const result = canFinishSetup(["business_profile"]);
    expect(result.canFinish).toBe(true);
    expect(result.outstanding).toEqual([]);
  });

  it("holds them only on the profile", () => {
    const result = canFinishSetup([]);
    expect(result.canFinish).toBe(false);
    expect(result.outstanding.map((s) => s.id)).toEqual(["business_profile"]);
  });

  it("does not care which optional steps were skipped", () => {
    const everySkippable = ONBOARDING_STEPS.map((s) => s.id).filter(
      (id): id is OnboardingStepId => id !== "business_profile"
    );
    expect(canFinishSetup(["business_profile"]).canFinish).toBe(true);
    expect(canFinishSetup(everySkippable).canFinish).toBe(false);
  });
});
