"use client";

import { useSearchParams } from "next/navigation";
import { useSubAccount } from "@/context/sub-account-context";
import {
  OnboardingWizard,
  type OnboardingWizardStepKey,
} from "@/components/dashboard/onboarding-wizard";

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
      requestedStep,
    )
      ? (requestedStep as OnboardingWizardStepKey)
      : null;

  return (
    <OnboardingWizard
      subAccountId={subAccountId}
      saPath={saPath}
      initialCompleted={subAccount?.onboardingStepsCompleted ?? []}
      initialStep={initialStep}
    />
  );
}
