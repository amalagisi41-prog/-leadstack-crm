"use client";

import { useEffect, useMemo, useState } from "react";
import type { SubAccountDoc } from "@/types/tenancy";
import { useOnboardingCompletion } from "@/hooks/use-onboarding-completion";
import { computeSetupProgress, type SetupProgress } from "@/lib/onboarding/setup-progress";
import {
  computeMethodProgress,
  methodInputsFor,
  type MethodProgress,
} from "@/lib/onboarding/method";

/** Whether the business details (Build → identity) are saved. */
export function useIdentityDone(subAccountId: string | null | undefined): boolean | null {
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    if (!subAccountId) return;
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
        // Leave progress unknown rather than guess.
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

export interface UseMethodProgress {
  /** The six-step AgentStack Method progress; null until both reads land. */
  method: MethodProgress | null;
  /** The account-step states the guided pop-ups are keyed on. */
  setup: SetupProgress | null;
  loading: boolean;
}

/**
 * The one client-side read of setup progress. The dashboard card, the setup
 * pill, the sidebar's Setup badge and the setup hub all call this, so they
 * cannot show different numbers for the same workspace.
 */
export function useMethodProgress(
  subAccountId: string | null | undefined,
  subAccount: SubAccountDoc | null | undefined,
): UseMethodProgress {
  const identityDone = useIdentityDone(subAccountId);
  const { completion, loading: completionLoading } = useOnboardingCompletion(subAccountId);
  const doneIds = completion?.doneStepIds;

  return useMemo(() => {
    if (!subAccount || identityDone === null || completionLoading || !doneIds) {
      return { method: null, setup: null, loading: true };
    }
    return {
      method: computeMethodProgress(methodInputsFor(subAccount, identityDone, doneIds)),
      setup: computeSetupProgress(subAccount, identityDone),
      loading: false,
    };
  }, [subAccount, identityDone, completionLoading, doneIds]);
}
