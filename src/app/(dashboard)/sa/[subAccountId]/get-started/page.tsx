"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSubAccount } from "@/context/sub-account-context";
import {
  OnboardingWizard,
  type OnboardingWizardStepKey,
} from "@/components/dashboard/onboarding-wizard";
import { SOLO_ENTITLEMENT_PATCH } from "@/lib/entitlements/solo";
import { OnboardingFoundation } from "@/components/dashboard/onboarding-foundation";
import { Loader2 } from "lucide-react";

/**
 * Mandatory first-run wizard. The sub-account dashboard redirects here at
 * login until all onboarding step IDs are in subAccount.onboardingStepsCompleted.
 *
 * The wizard walks through the AgentStack Method flow and can deep-link to a
 * specific step via ?step=build|connect|capture|respond|nurture|close.
 */
export default function GetStartedPage() {
  const searchParams = useSearchParams();
  const { subAccountId, subAccount, saPath, loading } = useSubAccount();
  const [foundationComplete, setFoundationComplete] = useState<boolean | null>(
    null
  );
  const requestedStep = searchParams.get("step");
  const initialStep =
    requestedStep &&
    ["build", "connect", "capture", "respond", "nurture", "close"].includes(
      requestedStep
    )
      ? (requestedStep as OnboardingWizardStepKey)
      : null;

  // Idempotent migration for workspaces created before the Solo entitlement
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
      body: JSON.stringify(SOLO_ENTITLEMENT_PATCH),
    }).catch(() => undefined);
  }, [subAccount, subAccountId]);

  useEffect(() => {
    if (loading || !subAccount) return;
    let active = true;
    void fetch(`/api/sub-accounts/${subAccountId}/onboarding-foundation`)
      .then(async (response) => {
        const data = (await response.json()) as {
          foundation?: { completed?: boolean };
        };
        if (active) setFoundationComplete(data.foundation?.completed === true);
      })
      .catch(() => {
        if (active) setFoundationComplete(false);
      });
    return () => {
      active = false;
    };
  }, [loading, subAccount, subAccountId]);

  if (loading || !subAccount || foundationComplete === null) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing your setup…
      </div>
    );
  }

  if (!foundationComplete) {
    return (
      <OnboardingFoundation
        subAccountId={subAccountId}
        saPath={saPath}
        onComplete={() => setFoundationComplete(true)}
      />
    );
  }

  return (
    <OnboardingWizard
      subAccountId={subAccountId}
      saPath={saPath}
      initialCompleted={subAccount?.onboardingStepsCompleted ?? []}
      initialStep={initialStep}
    />
  );
}
