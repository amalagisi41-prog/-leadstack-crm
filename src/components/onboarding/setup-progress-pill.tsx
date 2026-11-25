"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ListChecks, X } from "lucide-react";
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

const DISMISS_KEY = "agentstack:setup-bar-dismissed";

function readDismissed(subAccountId: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === subAccountId;
  } catch {
    return false;
  }
}

/**
 * Docked in the page flow above every workspace page (never floating over
 * content) until setup reaches 100%, so
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
  // Hidden for the rest of the browser session once the realtor dismisses it
  // (offered only after setup is underway, so a brand-new workspace keeps it).
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(readDismissed(subAccountId));
  }, [subAccountId]);
  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, subAccountId);
    } catch {
      // Storage blocked: still hide for this page view.
    }
    setDismissed(true);
  }

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
  const fullLabel = nextActionLabel(method) ?? nextStep.name;
  // Short form always fits ("Setup: 1 of 6 — Connect"); the task detail is
  // added where there is room and wraps rather than truncating.
  const label = (
    <>
      <span className="font-semibold">
        Setup: {method.completedCount} of {method.total} — {nextStep.name}
      </span>
      {nextTask ? (
        <span className="text-muted-foreground hidden md:inline">· {nextTask.label}</span>
      ) : null}
      <ArrowRight className="h-4 w-4 shrink-0" />
    </>
  );
  const pillClass =
    "hover:text-primary flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-left text-sm";

  if (dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Setup progress"
      className="bg-background mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-3 py-2"
    >
      {nextTask && SETUP_FLOW_IDS.has(nextTask.id) ? (
        <button type="button" className={pillClass} title={fullLabel} onClick={() => handleOpenChange(nextTask.id as SetupStepId, true)}>
          {label}
        </button>
      ) : (
        <Link href={saPath(nextTask?.href ?? SUB_ACCOUNT_ROUTES.getStarted)} className={pillClass} title={fullLabel}>
          {label}
        </Link>
      )}
      <span className="flex items-center gap-2">
        <Link
          href={setupHubHref(subAccountId)}
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ListChecks className="h-3 w-3" /> See all setup steps
        </Link>
        {method.completedCount > 0 ? (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide setup progress for this session"
            title="Hide for this session"
            className="text-muted-foreground hover:text-foreground rounded p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>

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
