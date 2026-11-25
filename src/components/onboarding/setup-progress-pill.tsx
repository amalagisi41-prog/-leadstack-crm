"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ListChecks } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";
import type { SetupStepId } from "@/lib/onboarding/setup-progress";
import { useAuth } from "@/hooks/use-auth";
import { useMethodProgress } from "@/hooks/use-method-progress";
import { nextActionLabel } from "@/lib/onboarding/method";
import { setupHubHref } from "@/lib/onboarding/setup-hub-href";
import { canAutoOpenOnboardingPrompt } from "@/lib/onboarding/prompt-gate";
import {
  markOnboardingCompleted,
  markPromptDismissed,
  markPromptShownThisSession,
  readPromptGate,
} from "@/lib/onboarding/prompt-gate-storage";
import {
  CommunicationsGuidedSetup,
  SetupStepPrompt,
  SocialGuidedSetup,
} from "@/components/onboarding/setup-guided-flows";
import { setupStepToPrompt } from "@/lib/onboarding/route-setup-step";

const SETUP_FLOW_IDS: ReadonlySet<string> = new Set(["identity", "communications", "listings", "social", "domain"]);

/**
 * Stays at the bottom of every workspace page until setup reaches 100%, so
 * the next step is always one click away. Its "x of 6" is The AgentStack
 * Method progress from useMethodProgress — the same figure the dashboard,
 * sidebar and setup hub show.
 *
 * It may also open the page's setup question on its own, but only through
 * the onboarding prompt gate: at most once per session, and never again for
 * 7 days after the realtor closes it ("not now"). It used to re-open on every
 * navigation until the step was done.
 */
export function SetupProgressPill() {
  const { subAccountId, subAccount, isAdmin, saPath } = useSubAccount();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const pathname = usePathname();
  const { method, setup } = useMethodProgress(subAccountId, subAccount);
  const [openFlow, setOpenFlow] = useState<SetupStepId | null>(null);
  const autoOpened = useRef(false);
  const onSetupPage = pathname?.endsWith(SUB_ACCOUNT_ROUTES.getStarted) ?? false;

  // Record completion once it is observed, so no onboarding modal ever opens
  // on its own again and lower-priority prompts (app install) may show.
  useEffect(() => {
    if (uid && method?.complete) void markOnboardingCompleted(uid);
  }, [uid, method?.complete]);

  useEffect(() => {
    if (!uid || !setup || !method || !isAdmin || onSetupPage || !pathname) return;
    if (method.complete || openFlow) return;
    let cancelled = false;
    void readPromptGate(uid).then((gate) => {
      if (cancelled || !canAutoOpenOnboardingPrompt(gate, Date.now())) return;
      const step = setupStepToPrompt(pathname, setup);
      if (!step) return;
      markPromptShownThisSession(uid);
      autoOpened.current = true;
      setOpenFlow(step);
    });
    return () => {
      cancelled = true;
    };
    // openFlow intentionally omitted: closing a flow must not re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, pathname, setup, method, isAdmin, onSetupPage]);

  function handleOpenChange(step: SetupStepId, open: boolean) {
    if (open) {
      setOpenFlow(step);
      return;
    }
    // Closing a pop-up that opened on its own without finishing its step is
    // "not now": suppressed for this session and the next 7 days.
    if (autoOpened.current && uid && setup?.states[step] !== "done") void markPromptDismissed(uid);
    autoOpened.current = false;
    setOpenFlow(null);
  }

  if (!subAccount || !isAdmin || !method || onSetupPage) return null;
  if (method.complete || !method.nextStep) return null;

  const nextStep = method.nextStep;
  const nextTask = nextStep.nextTask;
  const label = (
    <>
      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
        {method.completedCount} of {method.total}
      </span>
      <span className="truncate">Next: {nextActionLabel(method)}</span>
      <ArrowRight className="h-4 w-4 shrink-0" />
    </>
  );
  const pillClass =
    "bg-background flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg hover:border-primary";

  return (
    // Bottom-center, offset for the lg sidebar: the Crisp support bubble owns
    // the bottom-right corner, and the Business Profile page has its own
    // sticky save bar along the bottom.
    <div
      className={`fixed left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1.5 lg:left-[calc(50%+8rem)] ${
        pathname?.endsWith(SUB_ACCOUNT_ROUTES.businessProfile) ? "bottom-20" : "bottom-4"
      }`}
    >
      {nextTask && SETUP_FLOW_IDS.has(nextTask.id) ? (
        <button type="button" className={pillClass} onClick={() => handleOpenChange(nextTask.id as SetupStepId, true)}>
          {label}
        </button>
      ) : (
        <Link href={saPath(nextTask?.href ?? SUB_ACCOUNT_ROUTES.getStarted)} className={pillClass}>
          {label}
        </Link>
      )}
      <Link
        href={setupHubHref(subAccountId)}
        className="text-muted-foreground bg-background/80 inline-flex items-center gap-1 rounded-full px-2 text-xs hover:underline"
      >
        <ListChecks className="h-3 w-3" /> See all setup steps
      </Link>

      <CommunicationsGuidedSetup
        open={openFlow === "communications"}
        onOpenChange={(o) => handleOpenChange("communications", o)}
        subAccountId={subAccountId}
        subAccount={subAccount}
      />
      <SocialGuidedSetup
        open={openFlow === "social"}
        onOpenChange={(o) => handleOpenChange("social", o)}
        subAccountId={subAccountId}
        subAccount={subAccount}
      />
      {(["identity", "listings", "domain"] as const).map((step) => (
        <SetupStepPrompt
          key={step}
          step={step}
          open={openFlow === step}
          onOpenChange={(o) => handleOpenChange(step, o)}
          setupHref={saPath(`${SUB_ACCOUNT_ROUTES.getStarted}?revisit=1#setup-step-${step}`)}
        />
      ))}
    </div>
  );
}
