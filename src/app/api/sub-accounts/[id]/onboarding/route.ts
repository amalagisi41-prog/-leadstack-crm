import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { ONBOARDING_STEP_IDS } from "@/lib/onboarding/steps";
import { computeOnboardingState } from "@/lib/onboarding/state-machine";

/**
 * GET /api/sub-accounts/[id]/onboarding
 *
 * Returns the onboarding checklist's current state machine: which of the 8
 * canonical steps are done, whether setup is fully complete, and the single
 * `nextRecommendedAction` — the next incomplete step in canonical order.
 * Any member can read it (mirrors the PATCH's "setup is a shared task"
 * posture).
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }

  const state = computeOnboardingState(
    snap.data()?.onboardingStepsCompleted as string[] | undefined,
  );
  return NextResponse.json({ ok: true, ...state });
}

/**
 * PATCH /api/sub-accounts/[id]/onboarding
 *
 * Persists the setup-checklist progress for the sub-account. Any member can
 * update it (setup is a shared task). Body: { steps: string[] } — the ids of
 * completed onboarding steps; unknown ids are dropped.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { steps?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.steps)) {
    return NextResponse.json({ error: "`steps` must be an array." }, { status: 400 });
  }

  const known = new Set<string>(ONBOARDING_STEP_IDS);
  const steps = Array.from(
    new Set(body.steps.filter((s): s is string => typeof s === "string" && known.has(s))),
  );

  await getAdminDb().doc(`subAccounts/${subAccountId}`).update({
    onboardingStepsCompleted: steps,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, steps });
}
