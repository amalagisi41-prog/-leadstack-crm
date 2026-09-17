/**
 * The two questions first-run setup asks about the agent's business, and the
 * only two answers it has ever collected.
 *
 * They were being discarded. `RealtorLaunchWizard` asked both, sent them to
 * `PATCH /api/sub-accounts/[id]/onboarding`, and that route read only `steps`
 * and `wizardCompleted` — so the answers reached the server and were dropped
 * on the floor. Nothing else in the codebase referenced them.
 *
 * That is what made the wizard a checklist wearing a wizard's clothes: it
 * cannot adapt to an answer it does not keep. Persisting them is the
 * precondition for setup deriving what to wire from what the agent told us,
 * rather than presenting every feature to everyone and asking them to choose.
 *
 * Both are optional forever. An agent who closes the tab mid-wizard has
 * answered neither, and nothing downstream may treat a missing answer as an
 * error — see `SubAccountDoc.realtorRole`.
 */

export const REALTOR_ROLES = [
  "solo_agent",
  "team_lead",
  "brokerage",
  "other",
] as const;

export type RealtorRole = (typeof REALTOR_ROLES)[number];

export const LAUNCH_PRIORITIES = [
  "get_leads",
  "organize_database",
  "build_website",
  "ai_followup",
] as const;

export type LaunchPriority = (typeof LAUNCH_PRIORITIES)[number];

export function isRealtorRole(value: unknown): value is RealtorRole {
  return (
    typeof value === "string" &&
    (REALTOR_ROLES as readonly string[]).includes(value)
  );
}

export function isLaunchPriority(value: unknown): value is LaunchPriority {
  return (
    typeof value === "string" &&
    (LAUNCH_PRIORITIES as readonly string[]).includes(value)
  );
}
