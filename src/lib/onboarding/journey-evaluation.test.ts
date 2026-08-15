import { describe, expect, it } from "vitest";
import {
  evaluateOnboardingJourney,
  type JourneyEvent,
} from "./journey-evaluation";

const events = (names: JourneyEvent["name"][]): JourneyEvent[] =>
  names.map((name, index) => ({ name, atMs: index * 1000 }));

describe("Phase 5 onboarding journeys", () => {
  it("accepts the new-business golden path", () => {
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
      ])
    );
    expect(result.complete).toBe(true);
    expect(result.timeToTrustworthyPreviewMs).toBe(4000);
  });

  it("identifies dead ends in an existing-brand journey", () => {
    const result = evaluateOnboardingJourney(
      "existing_brand",
      events([
        "journey_started",
        "existing_site_verified",
        "blocked",
        "support_requested",
      ])
    );
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("trusted_preview");
    expect(result.blockedCount).toBe(1);
  });
});
