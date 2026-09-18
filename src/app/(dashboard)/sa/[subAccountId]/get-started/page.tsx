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
import { RealtorLaunchWizard } from "@/components/dashboard/realtor-launch-wizard";
import { Loader2 } from "lucide-react";
import { useOnboardingCompletion } from "@/hooks/use-onboarding-completion";

/**
 * Mandatory first-run wizard. The sub-account dashboard redirects here at
 * login until onboardingWizardCompletedAt is set.
 *
 * New workspaces get the streamlined Realtor Launch wizard (5 screens:
 * role → priority → identity → connect → launch). The old AgentStack Method
 * wizard is still accessible via ?step= deep-links for returning users who
 * started the original flow.
 */
export default function GetStartedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { subAccountId, subAccount, saPath, loading } = useSubAccount();
  // Must sit above every early return below — hooks run in the same order on
  // each render or React tears the component state apart.
  const { completion: onboardingCompletion } =
    useOnboardingCompletion(subAccountId);
  const [foundationComplete, setFoundationComplete] = useState<boolean | null>(
    null
  );
  /** True when this member lacks admin rights and so cannot run setup at all. */
  const [adminOnly, setAdminOnly] = useState(false);
  const requestedStep = searchParams.get("step");
  const initialStep =
    requestedStep &&
    ["build", "connect", "capture", "respond", "nurture", "close"].includes(
      requestedStep
    )
      ? (requestedStep as OnboardingWizardStepKey)
      : null;
  const setupIsComplete = Boolean(subAccount?.onboardingWizardCompletedAt);

  useEffect(() => {
    if (loading || !subAccount || requestedStep || !setupIsComplete) return;
    router.replace(saPath("/dashboard"));
  }, [loading, requestedStep, router, saPath, setupIsComplete, subAccount]);

  // Idempotent migration for workspaces created before the Solo entitlement
  // baseline shipped.
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

  // Collaborators bypass setup entirely.
  if (adminOnly) {
    return (
      <div className="bg-card mx-auto max-w-lg space-y-4 rounded-2xl border p-8 text-center">
        <h1 className="text-lg font-semibold">
          Setup is handled by your workspace admin
        </h1>
        <p className="text-muted-foreground text-sm">
          Your account is set up as a collaborator, so the first-run setup steps
          aren&apos;t yours to complete. Everything else in{" "}
          {subAccount?.name ?? "this workspace"} is ready for you now.
        </p>
        <Button render={<Link href={saPath("/dashboard")} />}>
          Go to my dashboard
        </Button>
      </div>
    );
  }

  if (
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

  // Deep-link into the legacy wizard (returning users who started the old flow)
  if (initialStep && foundationComplete) {
    return (
      <OnboardingWizard
        subAccountId={subAccountId}
        saPath={saPath}
        // Derived, not the stored tick list: a returning user resumes at the
        // first step the WORKSPACE cannot show as done, rather than at the
        // first one nobody happened to tick.
        initialCompleted={onboardingCompletion?.doneStepIds ?? []}
        initialStep={initialStep}
      />
    );
  }

  // New default: Realtor Launch wizard (role → priority → identity → connect
  // → launch). Stored answers are passed in so a refresh resumes at the first
  // unanswered question instead of restarting from screen one.
  return (
    <RealtorLaunchWizard
      subAccountId={subAccountId}
      saPath={saPath}
      initialRole={subAccount.realtorRole ?? null}
      initialPriority={subAccount.launchPriority ?? null}
      subAccount={subAccount}
    />
  );
}
