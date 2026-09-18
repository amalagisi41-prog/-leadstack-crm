import { describe, expect, it } from "vitest";
import {
  evaluateOnboardingJourney,
  type JourneyEvent,
} from "./journey-evaluation";
import { EMPTY_ONBOARDING_SIGNALS, type OnboardingSignals } from "./completion";
import { ONBOARDING_STEP_IDS } from "./steps";

const events = (names: JourneyEvent["name"][]): JourneyEvent[] =>
  names.map((name, index) => ({ name, atMs: index * 1000 }));

/** A workspace whose required steps are all genuinely done. */
const SET_UP: OnboardingSignals = {
  ...EMPTY_ONBOARDING_SIGNALS,
  businessProfileCompletionPct: 100,
  contactCount: 120,
  formCount: 1,
  workflowCount: 1,
  bookingPageCount: 1,
  dealCount: 3,
  customDomainLive: true,
};

/** A client keeping their existing website — nothing to publish, nothing to point. */
const KEEPS_OWN_SITE: OnboardingSignals = {
  ...SET_UP,
  customDomainLive: false,
  externalHostRecorded: true,
};

describe("evaluateOnboardingJourney", () => {
  it("reports complete for a workspace that is set up", () => {
    const result = evaluateOnboardingJourney(
      "new_business",
      events([]),
      SET_UP
    );
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("completes an existing-brand journey with no published site", () => {
    // The old model required a `published` event here, so a client staying on
    // their own website could never finish the journey named for them.
    const result = evaluateOnboardingJourney(
      "existing_brand",
      events(["journey_started", "existing_site_verified"]),
      KEEPS_OWN_SITE
    );
    expect(result.complete).toBe(true);
  });

  it("does not need any event to be emitted to report completeness", () => {
    // The old model needed eight events; only three were ever emitted, so it
    // could never report done. Completeness must not depend on the log.
    const result = evaluateOnboardingJourney("new_business", [], SET_UP);
    expect(result.complete).toBe(true);
  });

  it("names outstanding work instead of naming a missing event", () => {
    const result = evaluateOnboardingJourney(
      "existing_brand",
      events(["journey_started", "blocked", "support_requested"]),
      { ...SET_UP, contactCount: 0 }
    );
    expect(result.complete).toBe(false);
    expect(result.missing.map((s) => s.id)).toEqual(["contacts"]);
    expect(result.missing[0].missing).toBeTruthy();
    expect(result.blockedCount).toBe(1);
    expect(result.supportRequestCount).toBe(1);
  });

  it("never counts a tick as completion", () => {
    const result = evaluateOnboardingJourney(
      "new_business",
      [],
      EMPTY_ONBOARDING_SIGNALS,
      [...ONBOARDING_STEP_IDS]
    );
    expect(result.complete).toBe(false);
    expect(result.attestedStepIds.length).toBeGreaterThan(0);
  });

  it("still times the parts that really are instrumented", () => {
    const result = evaluateOnboardingJourney(
      "new_business",
      events([
        "journey_started",
        "identity_completed",
        "preset_selected",
        "lead_path_connected",
        "trusted_preview",
        "domain_ready",
        "release_approved",
        "published",
      ]),
      SET_UP
    );
    expect(result.timeToTrustworthyPreviewMs).toBe(4000);
    expect(result.timeToPublishMs).toBe(7000);
  });

  it("returns null timings rather than guessing when an event never fired", () => {
    const result = evaluateOnboardingJourney(
      "new_business",
      events(["trusted_preview"]),
      SET_UP
    );
    expect(result.timeToTrustworthyPreviewMs).toBeNull();
    expect(result.timeToPublishMs).toBeNull();
  });
});
