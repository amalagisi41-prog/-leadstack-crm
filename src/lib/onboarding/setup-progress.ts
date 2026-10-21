import type { SubAccountDoc } from "@/types/tenancy";

/**
 * The six account-setup steps and their lock/done rules, shared by the Setup
 * page and the always-visible setup pill so the two can never disagree about
 * how far along a workspace is. Every "done" is derived from persisted facts
 * on the sub-account (or the business profile, for identity) — never from a
 * stored step pointer or a click.
 */

export type SetupStepId =
  | "identity"
  | "communications"
  | "listings"
  | "social"
  | "payments"
  | "domain";

export type SetupStepState = "done" | "active" | "locked";

export const SETUP_STEP_ORDER: readonly SetupStepId[] = [
  "identity",
  "communications",
  "listings",
  "social",
  "payments",
  "domain",
];

export const SETUP_STEP_TITLES: Record<SetupStepId, string> = {
  identity: "Identity",
  communications: "Communications account",
  listings: "Listings source",
  social: "Social",
  payments: "Payments",
  domain: "Domain",
};

/** Plain-language label for the pill: what the realtor is about to do. */
export const SETUP_STEP_ACTIONS: Record<SetupStepId, string> = {
  identity: "Add your business details",
  communications: "Connect your email or phone",
  listings: "Connect your listings",
  social: "Connect Facebook & Instagram",
  payments: "Add your payment link",
  domain: "Connect your domain",
};

/**
 * Steps an operator may skip. Identity and Communications are mandatory —
 * everything downstream needs them — so a skip naming either is ignored
 * here even though the API route already refuses to persist one.
 */
const SKIPPABLE_STEP_IDS = new Set<SetupStepId>(["listings", "social", "payments", "domain"]);

export function deriveSetupStepStates(
  doneMap: Record<SetupStepId, boolean>,
  skippedStepIds: readonly string[],
): Record<SetupStepId, SetupStepState> {
  const skipped = new Set(
    skippedStepIds.filter((id): id is SetupStepId => SKIPPABLE_STEP_IDS.has(id as SetupStepId)),
  );
  const isSatisfied = (id: SetupStepId) => doneMap[id] || skipped.has(id);
  const isUnlocked = (id: SetupStepId): boolean => {
    switch (id) {
      case "identity":
        return true;
      case "communications":
        return doneMap.identity;
      case "listings":
      case "social":
        return doneMap.communications;
      case "payments":
      case "domain":
        return isSatisfied("listings") && isSatisfied("social");
    }
  };
  const result = {} as Record<SetupStepId, SetupStepState>;
  for (const id of SETUP_STEP_ORDER) {
    result[id] = isSatisfied(id) ? "done" : isUnlocked(id) ? "active" : "locked";
  }
  return result;
}

/** Done-ness of every step except identity, which lives on the business profile. */
export function setupDoneMap(
  subAccount: SubAccountDoc,
  identityDone: boolean,
): Record<SetupStepId, boolean> {
  return {
    identity: identityDone,
    communications:
      subAccount.twilioConfig?.enabled === true ||
      subAccount.googleAccountConfig?.status === "connected" ||
      subAccount.calendarConfig?.status === "connected",
    listings: subAccount.idxConfig?.enabled === true,
    social: subAccount.metaConfig?.connected === true,
    payments: Boolean(subAccount.paymentPortalConfig?.url),
    domain: Boolean(subAccount.customDomain),
  };
}

export interface SetupProgress {
  states: Record<SetupStepId, SetupStepState>;
  satisfiedCount: number;
  total: number;
  complete: boolean;
  /** First step the realtor can act on right now, or null when complete. */
  nextStep: SetupStepId | null;
}

export function computeSetupProgress(
  subAccount: SubAccountDoc,
  identityDone: boolean,
): SetupProgress {
  const states = deriveSetupStepStates(
    setupDoneMap(subAccount, identityDone),
    subAccount.setupSkippedSteps ?? [],
  );
  const satisfiedCount = SETUP_STEP_ORDER.filter((id) => states[id] === "done").length;
  return {
    states,
    satisfiedCount,
    total: SETUP_STEP_ORDER.length,
    complete: satisfiedCount === SETUP_STEP_ORDER.length,
    nextStep: SETUP_STEP_ORDER.find((id) => states[id] === "active") ?? null,
  };
}
