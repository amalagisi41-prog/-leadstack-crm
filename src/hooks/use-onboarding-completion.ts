"use client";

import { useEffect, useState } from "react";
import type { StepCompletion } from "@/lib/onboarding/completion";

/**
 * Onboarding progress, derived from what the workspace contains.
 *
 * Every surface that shows setup progress used to read
 * `subAccount.onboardingStepsCompleted` — the raw list of ticked step ids —
 * straight off the Firestore document. That list is wrong in both directions
 * at once: a workspace with hundreds of contacts still counted "contacts" as
 * outstanding because nobody ticked it, while a pipeline with no deals counted
 * as done because somebody did. Two surfaces reading it produced two different
 * percentages for the same workspace on the same day.
 *
 * `GET /api/sub-accounts/{id}/onboarding` already derives the truth (see
 * lib/onboarding/completion.ts). This hook is the one client-side way to read
 * it, so the dashboard, the first-run wizard and the checklist cannot disagree.
 */

export interface OnboardingCompletion {
  /** Ids counted as done — observed, or ticked and labelled as such. */
  doneStepIds: string[];
  /** Observed in the workspace. The only evidence that earns "fully set up". */
  verifiedStepIds: string[];
  /** Ticked by a user, unconfirmed by the workspace. */
  attestedStepIds: string[];
  fullyVerified: boolean;
  steps: StepCompletion[];
}

export interface UseOnboardingCompletion {
  completion: OnboardingCompletion | null;
  /**
   * True until the first answer arrives. Callers must not render a progress
   * figure while this is true — showing 0% before the data lands reads as "you
   * have done nothing", which is its own false claim.
   */
  loading: boolean;
}

export function useOnboardingCompletion(
  subAccountId: string | null | undefined,
  options: { enabled?: boolean } = {}
): UseOnboardingCompletion {
  const enabled = options.enabled !== false && !!subAccountId;
  const [completion, setCompletion] = useState<OnboardingCompletion | null>(
    null
  );
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setCompletion(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void fetch(`/api/sub-accounts/${subAccountId}/onboarding`)
      .then(async (r) => (r.ok ? await r.json() : null))
      .then((data) => {
        if (!active) return;
        // A failed or malformed read leaves `completion` null. Callers show
        // nothing rather than inventing a number — the same rule the server
        // follows when a query fails.
        if (data?.ok) {
          setCompletion({
            doneStepIds: data.completedStepIds ?? [],
            verifiedStepIds: data.verifiedStepIds ?? [],
            attestedStepIds: data.attestedStepIds ?? [],
            fullyVerified: data.fullyVerified === true,
            steps: data.steps ?? [],
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subAccountId, enabled]);

  return { completion, loading };
}
