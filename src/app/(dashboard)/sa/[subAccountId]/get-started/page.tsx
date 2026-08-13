"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const { subAccountId, subAccount, saPath, loading } = useSubAccount();
  const [foundationComplete, setFoundationComplete] = useState<boolean | null>(
    null
  );
  const requestedStep = searchParams.get("step");
  const isGhlJourney =
    searchParams.get("source") === "ghl" || searchParams.has("ghl");
  const initialStep =
    requestedStep &&
    ["build", "connect", "capture", "respond", "nurture", "close"].includes(
      requestedStep
    )
      ? (requestedStep as OnboardingWizardStepKey)
      : null;
  const setupIsComplete = [
    "build",
    "connect",
    "capture",
    "respond",
    "nurture",
    "close",
  ].every((step) => subAccount?.onboardingStepsCompleted?.includes(step));

  // Idempotent migration for workspaces created before the Solo entitlement
  // entitlement baseline shipped. The endpoint is agency-owner-only; invited
  // members receive a harmless 403 and keep their agency-managed gates.
  useEffect(() => {
    if (!isGhlJourney || !subAccountId) return;
    const destination = new URLSearchParams({ source: "ghl" });
    const status = searchParams.get("ghl");
    if (status) destination.set("ghl", status);
    router.replace(`${saPath("/import")}?${destination.toString()}`);
  }, [isGhlJourney, router, saPath, searchParams, subAccountId]);

  useEffect(() => {
    if (
      loading ||
      !subAccount ||
      isGhlJourney ||
      requestedStep ||
      !setupIsComplete
    )
      return;
    router.replace(saPath("/dashboard"));
  }, [
    isGhlJourney,
    loading,
    requestedStep,
    router,
    saPath,
    setupIsComplete,
    subAccount,
  ]);

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

  if (
    isGhlJourney ||
    (setupIsComplete && !requestedStep) ||
    loading ||
    !subAccount ||
    foundationComplete === null
  ) {
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
