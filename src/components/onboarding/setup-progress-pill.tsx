"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ListChecks } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";
import {
  SETUP_STEP_ACTIONS,
  computeSetupProgress,
  type SetupStepId,
} from "@/lib/onboarding/setup-progress";
import {
  CommunicationsGuidedSetup,
  SetupStepPrompt,
  SocialGuidedSetup,
} from "@/components/onboarding/setup-guided-flows";
import { setupStepToPrompt } from "@/lib/onboarding/route-setup-step";

function useIdentityDone(subAccountId: string): boolean | null {
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(`/api/sub-accounts/${subAccountId}/business-profile`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile?: { brokerage?: string; licenseNumber?: string; serviceAreas?: string };
        };
        const p = data.profile;
        if (active) {
          setDone(Boolean(p?.brokerage?.trim() && p?.licenseNumber?.trim() && p?.serviceAreas?.trim()));
        }
      } catch {
        // Leave the pill hidden rather than guess at progress.
      }
    }
    void load();
    // Identity can be saved on another page; re-check when the tab regains focus.
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [subAccountId]);
  return done;
}

/**
 * Stays at the bottom of every workspace page until setup reaches 100%, so
 * the next step is always one click away. Progress comes from the same
 * derivation as the Setup page and only moves when a connection is
 * confirmed — clicking through a pop-up never advances it.
 */
export function SetupProgressPill() {
  const { subAccountId, subAccount, isAdmin, saPath } = useSubAccount();
  const pathname = usePathname();
  const identityDone = useIdentityDone(subAccountId);
  const [openFlow, setOpenFlow] = useState<SetupStepId | null>(null);

  const progress = useMemo(
    () => (subAccount && identityDone !== null ? computeSetupProgress(subAccount, identityDone) : null),
    [subAccount, identityDone],
  );
  const onSetupPage = pathname?.endsWith(SUB_ACCOUNT_ROUTES.getStarted) ?? false;

  // Each page asks the setup question it depends on, once per visit: the
  // pop-up opens when the realtor arrives on a page, not again on every
  // re-render or live update while they're still there.
  const promptedPath = useRef<string | null>(null);
  useEffect(() => {
    if (!progress || !isAdmin || onSetupPage || !pathname) return;
    if (promptedPath.current === pathname) return;
    promptedPath.current = pathname;
    const step = setupStepToPrompt(pathname, progress);
    if (step) setOpenFlow(step);
  }, [pathname, progress, isAdmin, onSetupPage]);

  if (!subAccount || !isAdmin || !progress || onSetupPage) return null;
  if (progress.complete || !progress.nextStep) return null;

  const next = progress.nextStep;
  const label = (
    <>
      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
        {progress.satisfiedCount} of {progress.total}
      </span>
      <span className="truncate">Next: {SETUP_STEP_ACTIONS[next]}</span>
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
      <button type="button" className={pillClass} onClick={() => setOpenFlow(next)}>
        {label}
      </button>
      <Link
        href={saPath(SUB_ACCOUNT_ROUTES.getStarted)}
        className="text-muted-foreground bg-background/80 inline-flex items-center gap-1 rounded-full px-2 text-xs hover:underline"
      >
        <ListChecks className="h-3 w-3" /> See all setup steps
      </Link>

      <CommunicationsGuidedSetup
        open={openFlow === "communications"}
        onOpenChange={(o) => setOpenFlow(o ? "communications" : null)}
        subAccountId={subAccountId}
        subAccount={subAccount}
      />
      <SocialGuidedSetup
        open={openFlow === "social"}
        onOpenChange={(o) => setOpenFlow(o ? "social" : null)}
        subAccountId={subAccountId}
        subAccount={subAccount}
      />
      {(["identity", "listings", "domain"] as const).map((step) => (
        <SetupStepPrompt
          key={step}
          step={step}
          open={openFlow === step}
          onOpenChange={(o) => setOpenFlow(o ? step : null)}
          setupHref={saPath(SUB_ACCOUNT_ROUTES.getStarted)}
        />
      ))}
    </div>
  );
}
