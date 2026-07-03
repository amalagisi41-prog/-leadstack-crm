"use client";

import { useSubAccount } from "@/context/sub-account-context";
import { OnboardingWizard } from "@/components/dashboard/onboarding-wizard";

/**
 * Mandatory first-run wizard. The sub-account dashboard redirects here at
 * login until all onboarding step IDs are in subAccount.onboardingStepsCompleted.
 *
 * The wizard walks through 6 screens (Business Profile → Import Contacts →
 * Choose Goals → Launch Marketing → AI Setup → Done). Completing the final
 * screen marks all step IDs done and redirects to the dashboard.
 */
export default function GetStartedPage() {
  const { subAccountId, subAccount, saPath } = useSubAccount();

  return (
    <OnboardingWizard
      subAccountId={subAccountId}
      saPath={saPath}
      initialCompleted={subAccount?.onboardingStepsCompleted ?? []}
    />
  );
}
