export type OnboardingJourney = "new_business" | "existing_brand";
export type JourneyEventName =
  | "journey_started"
  | "identity_completed"
  | "preset_selected"
  | "existing_site_verified"
  | "trusted_preview"
  | "lead_path_connected"
  | "domain_ready"
  | "release_approved"
  | "published"
  | "blocked"
  | "support_requested"
  | "rollback";

export type JourneyEvent = {
  name: JourneyEventName;
  atMs: number;
  detail?: string;
};

const REQUIRED: Record<OnboardingJourney, JourneyEventName[]> = {
  new_business: [
    "journey_started",
    "identity_completed",
    "preset_selected",
    "lead_path_connected",
    "trusted_preview",
    "domain_ready",
    "release_approved",
    "published",
  ],
  existing_brand: [
    "journey_started",
    "existing_site_verified",
    "identity_completed",
    "trusted_preview",
    "lead_path_connected",
    "domain_ready",
    "release_approved",
    "published",
  ],
};

export function evaluateOnboardingJourney(
  journey: OnboardingJourney,
  events: JourneyEvent[]
) {
  const ordered = [...events].sort((a, b) => a.atMs - b.atMs);
  const names = new Set(ordered.map((event) => event.name));
  const missing = REQUIRED[journey].filter((event) => !names.has(event));
  const started = ordered.find(
    (event) => event.name === "journey_started"
  )?.atMs;
  const preview = ordered.find(
    (event) => event.name === "trusted_preview"
  )?.atMs;
  const published = ordered.find((event) => event.name === "published")?.atMs;
  return {
    journey,
    complete: missing.length === 0,
    missing,
    blockedCount: ordered.filter((event) => event.name === "blocked").length,
    supportRequestCount: ordered.filter(
      (event) => event.name === "support_requested"
    ).length,
    rollbackCount: ordered.filter((event) => event.name === "rollback").length,
    timeToTrustworthyPreviewMs:
      started !== undefined && preview !== undefined ? preview - started : null,
    timeToPublishMs:
      started !== undefined && published !== undefined
        ? published - started
        : null,
  };
}
