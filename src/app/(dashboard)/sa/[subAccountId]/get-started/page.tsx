"use client";

import { useSubAccount } from "@/context/sub-account-context";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";

/**
 * Mandatory setup landing. The sub-account dashboard redirects here at login
 * until every onboarding step is marked complete (persisted per sub-account).
 */
export default function GetStartedPage() {
  const { subAccountId, subAccount, saPath } = useSubAccount();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Let&apos;s get you set up</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Finish these steps to activate your CRM. Your progress is saved — you
          can pick up where you left off any time.
        </p>
      </div>
      <OnboardingChecklist
        saPath={saPath}
        subAccountId={subAccountId}
        initialCompleted={subAccount?.onboardingStepsCompleted ?? []}
        mandatory
      />
    </div>
  );
}
