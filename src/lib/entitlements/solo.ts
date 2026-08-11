/**
 * Client-safe entitlement baseline for an AgentStack Solo workspace.
 *
 * Website Studio also unlocks Marketing Pages because both surfaces share
 * the same agency gate. Provider/compliance-dependent products remain off;
 * their disabled sidebar entries are hidden so a new solo subscriber sees a
 * focused setup instead of a wall of administrator locks.
 */
export const SOLO_FEATURE_GATES = {
  websiteStudioEnabledByAgency: true,
  broadcastsHiddenWhenDisabled: true,
  websiteHiddenWhenDisabled: true,
  socialPlannerHiddenWhenDisabled: true,
  communityHiddenWhenDisabled: true,
  idxHiddenWhenDisabled: true,
} as const;

/** Payload shape accepted by the agency-owner feature-gates endpoint. */
export const SOLO_ENTITLEMENT_PATCH = {
  websiteStudioEnabled: true,
  broadcastsHiddenWhenDisabled: true,
  websiteHiddenWhenDisabled: true,
  socialPlannerHiddenWhenDisabled: true,
  communityHiddenWhenDisabled: true,
  idxHiddenWhenDisabled: true,
} as const;
