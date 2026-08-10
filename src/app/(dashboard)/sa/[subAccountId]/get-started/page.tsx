"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSubAccount } from "@/context/sub-account-context";
import {
  OnboardingWizard,
  type OnboardingWizardStepKey,
} from "@/components/dashboard/onboarding-wizard";
import { SOLO_FOUNDING_BETA_ENTITLEMENT_PATCH } from "@/lib/entitlements/founding-beta";

/**
 * Mandatory first-run wizard. The sub-account dashboard redirects here at
 * login until all onboarding step IDs are in subAccount.onboardingStepsCompleted.
 *
 * The wizard walks through the AgentStack Method flow and can deep-link to a
 * specific step via ?step=build|connect|capture|respond|nurture|close.
 */
export default function GetStartedPage() {
  const searchParams = useSearchParams();
  const { subAccountId, subAccount, saPath } = useSubAccount();
  const requestedStep = searchParams.get("step");
  const initialStep =
    requestedStep &&
    ["build", "connect", "capture", "respond", "nurture", "close"].includes(
      requestedStep
    )
      ? (requestedStep as OnboardingWizardStepKey)
      : null;

  // Idempotent migration for workspaces created before the founding-beta
  // entitlement baseline shipped. The endpoint is agency-owner-only; invited
  // members receive a harmless 403 and keep their agency-managed gates.
  useEffect(() => {
    if (!subAccountId || !subAccount) return;
    const alreadyAligned =
      subAccount.websiteStudioEnabledByAgency === true &&
      subAccount.broadcastsHiddenWhenDisabled === true &&
      subAccount.websiteHiddenWhenDisabled === true &&
      subAccount.socialPlannerHiddenWhenDisabled === true &&
      subAccount.communityHiddenWhenDisabled === true &&
      subAccount.idxHiddenWhenDisabled === true;
    if (alreadyAligned) return;

    void fetch(`/api/agency/sub-accounts/${subAccountId}/feature-gates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SOLO_FOUNDING_BETA_ENTITLEMENT_PATCH),
    }).catch(() => undefined);
  }, [subAccount, subAccountId]);

  return (
    <OnboardingWizard
      subAccountId={subAccountId}
      saPath={saPath}
      initialCompleted={subAccount?.onboardingStepsCompleted ?? []}
      initialStep={initialStep}
    />
  );
}
