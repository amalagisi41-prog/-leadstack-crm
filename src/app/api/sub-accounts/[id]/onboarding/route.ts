import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  ONBOARDING_STEP_IDS,
  isOnboardingComplete,
} from "@/lib/onboarding/steps";
import { computeOnboardingState } from "@/lib/onboarding/state-machine";
import { summarizeOnboardingCompletion } from "@/lib/onboarding/completion";
import { readOnboardingSignals } from "@/lib/onboarding/read-signals";
import { queueOnboardingLifecycleSequence } from "@/lib/onboarding/lifecycle-email";
import { isLaunchPriority, isRealtorRole } from "@/types/onboarding-answers";

/**
 * GET /api/sub-accounts/[id]/onboarding
 *
 * Returns the onboarding checklist's current state: which steps are done and
 * on what evidence (observed in the workspace vs. ticked by a user), whether
 * setup is fully VERIFIED, and the single `nextRecommendedAction`.
 * Any member can read it (mirrors the PATCH's "setup is a shared task"
 * posture).
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 }
    );
  }

  // Progress is derived from what the workspace contains, not from what was
  // ticked. Stored ticks are still honoured, but reported as `attested` so no
  // surface can present someone's claim as evidence — see
  // lib/onboarding/completion.ts.
  const attested = (snap.data()?.onboardingStepsCompleted ?? []) as string[];
  const signals = await readOnboardingSignals(getAdminDb(), subAccountId);
  const completion = summarizeOnboardingCompletion(signals, attested);
  const state = computeOnboardingState(completion.doneStepIds);

  return NextResponse.json({
    ok: true,
    ...state,
    steps: completion.steps,
    verifiedStepIds: completion.verifiedStepIds,
    attestedStepIds: completion.attestedStepIds,
    fullyVerified: completion.fullyVerified,
    outstanding: completion.outstanding,
  });
}

/**
 * PATCH /api/sub-accounts/[id]/onboarding
 *
 * Persists the setup-checklist progress for the sub-account. Any member can
 * update it (setup is a shared task).
 *
 * Body:
 *   steps: string[]            — ids of completed onboarding steps; unknown
 *                                ids are dropped.
 *   wizardCompleted?: true     — records that the wizard was walked through.
 *   realtorRole?, launchPriority?
 *                              — the wizard's two business questions. These
 *                                were being sent by the wizard and silently
 *                                discarded here, which is why setup could
 *                                never adapt to them. Each is applied only
 *                                when present and recognised, so a PATCH that
 *                                carries only `steps` leaves stored answers
 *                                untouched rather than erasing them.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: {
    steps?: unknown;
    wizardCompleted?: unknown;
    realtorRole?: unknown;
    launchPriority?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // `steps` is optional so an answers-only PATCH can't clobber the checklist.
  // It used to be required and always written, which meant saving an answer
  // mid-wizard would have reset every completed step to none.
  if (body.steps !== undefined && !Array.isArray(body.steps)) {
    return NextResponse.json(
      { error: "`steps` must be an array." },
      { status: 400 }
    );
  }

  const known = new Set<string>(ONBOARDING_STEP_IDS);
  const steps = Array.isArray(body.steps)
    ? Array.from(
        new Set(
          body.steps.filter(
            (s): s is string => typeof s === "string" && known.has(s)
          )
        )
      )
    : null;

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (steps) {
    update.onboardingStepsCompleted = steps;
  }

  // The wizard reports its own completion separately from the checklist.
  // Three of the nine checklist ids (`contacts`, `sms`, `booking`) have no
  // wizard step, so "finished the wizard" and "checklist is complete" are
  // different facts and must be stored as different fields — see the note on
  // SubAccountDoc.onboardingWizardCompletedAt. Only ever set, never cleared:
  // having been walked through setup is not something that becomes untrue.
  if (body.wizardCompleted === true) {
    update.onboardingWizardCompletedAt = FieldValue.serverTimestamp();
  }

  // Applied only when present and recognised. The wizard saves each answer
  // the moment it's picked, so these arrive on their own PATCHes; an
  // unrecognised value is ignored rather than 400-ing, because a stale client
  // sending a retired option must never block someone from finishing setup.
  if (isRealtorRole(body.realtorRole)) {
    update.realtorRole = body.realtorRole;
  }
  if (isLaunchPriority(body.launchPriority)) {
    update.launchPriority = body.launchPriority;
  }
  if (steps && isOnboardingComplete(steps)) {
    update["onboardingLifecycleEmails.completedAt"] =
      FieldValue.serverTimestamp();
  }

  await getAdminDb().doc(`subAccounts/${subAccountId}`).update(update);

  // Only a checklist PATCH drives the lifecycle emails. An answers-only save
  // says nothing about how far along setup is, so it must not re-queue them.
  if (steps && !isOnboardingComplete(steps)) {
    try {
      await queueOnboardingLifecycleSequence(subAccountId);
    } catch (err) {
      console.error("[onboarding] lifecycle queue failed", subAccountId, err);
    }
  }

  return NextResponse.json({ ok: true, steps: steps ?? undefined });
}
