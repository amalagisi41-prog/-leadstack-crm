"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
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
  /** True when this member lacks admin rights and so cannot run setup at all. */
  const [adminOnly, setAdminOnly] = useState(false);
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
  // Someone who has already finished the wizard should not be dropped back
  // into it when they navigate here directly.
  //
  // This previously looked for the method keys "build"/"connect"/… inside
  // `onboardingStepsCompleted`, which could never match: the onboarding PATCH
  // route filters writes against ONBOARDING_STEP_IDS (the nine granular ids),
  // so those six keys were silently dropped and never persisted by anything.
  const setupIsComplete = Boolean(subAccount?.onboardingWizardCompletedAt);

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
        // A 403 means this member isn't a sub-account admin. The foundation
        // endpoint is admin-only for both GET and PATCH, so showing them the
        // foundation screen trapped them permanently: the save always 403s,
        // onComplete never fires, and the dashboard redirects them straight
        // back here on every visit. They could never reach the CRM at all.
        if (response.status === 403) {
          if (active) setAdminOnly(true);
          return;
        }
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

  // A collaborator can't run setup, but they must still be able to use the
  // workspace. Give them a real way out instead of a screen they can never
  // complete.
  if (adminOnly) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold">
          Setup is handled by your workspace admin
        </h1>
        <p className="text-muted-foreground text-sm">
          Your account is set up as a collaborator, so the first-run setup steps
          aren&apos;t yours to complete. Everything else in {subAccount?.name ?? "this workspace"} is
          ready for you now.
        </p>
        <Button render={<Link href={saPath("/dashboard")} />}>
          Go to my dashboard
        </Button>
      </div>
    );
  }

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
