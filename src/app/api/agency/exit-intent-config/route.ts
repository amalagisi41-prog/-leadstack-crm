import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";

/**
 * Agency-owner-only editor for the landing page's exit-intent offer
 * (`appConfig/exitIntentModal`). Read publicly by the unauthenticated landing
 * page via the client hook; written here through the Admin SDK (bypasses the
 * `allow write: if false` rule). Text-only by design — this does NOT touch
 * Stripe. The `couponCode` must independently exist as an active Stripe
 * promotion code for the discount to apply at checkout; `discountAmount` is
 * display copy and must be kept in sync with the real Stripe coupon manually.
 */

const DOC_PATH = "appConfig/exitIntentModal";

interface PatchBody {
  enabled?: boolean;
  couponCode?: string;
  discountAmount?: number;
  couponsTotal?: number;
  couponsUsed?: number;
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

export async function PATCH(request: Request) {
  const auth = await requireAgencyOwner(request);
  if (auth instanceof NextResponse) return auth;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: auth.uid,
  };

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "`enabled` must be a boolean." },
        { status: 400 },
      );
    }
    updates.enabled = body.enabled;
  }

  if (body.couponCode !== undefined) {
    const code =
      typeof body.couponCode === "string" ? body.couponCode.trim() : "";
    if (!code || code.length > 64) {
      return NextResponse.json(
        { error: "`couponCode` must be 1–64 characters." },
        { status: 400 },
      );
    }
    updates.couponCode = code;
  }

  if (body.discountAmount !== undefined) {
    if (!isNonNegativeInt(body.discountAmount)) {
      return NextResponse.json(
        { error: "`discountAmount` must be a whole number ≥ 0." },
        { status: 400 },
      );
    }
    updates.discountAmount = body.discountAmount;
  }

  if (body.couponsTotal !== undefined) {
    if (!isNonNegativeInt(body.couponsTotal)) {
      return NextResponse.json(
        { error: "`couponsTotal` must be a whole number ≥ 0." },
        { status: 400 },
      );
    }
    updates.couponsTotal = body.couponsTotal;
  }

  if (body.couponsUsed !== undefined) {
    if (!isNonNegativeInt(body.couponsUsed)) {
      return NextResponse.json(
        { error: "`couponsUsed` must be a whole number ≥ 0." },
        { status: 400 },
      );
    }
    updates.couponsUsed = body.couponsUsed;
  }

  // Cross-field guard: used can't exceed total. Resolve effective values
  // (incoming override, else what's already persisted) so a partial PATCH
  // can't create an inconsistent state.
  const hasTotal = body.couponsTotal !== undefined;
  const hasUsed = body.couponsUsed !== undefined;
  if (hasTotal || hasUsed) {
    const snap = await getAdminDb().doc(DOC_PATH).get();
    const existing = (snap.data() ?? {}) as PatchBody;
    const effTotal = hasTotal
      ? (body.couponsTotal as number)
      : typeof existing.couponsTotal === "number"
        ? existing.couponsTotal
        : 0;
    const effUsed = hasUsed
      ? (body.couponsUsed as number)
      : typeof existing.couponsUsed === "number"
        ? existing.couponsUsed
        : 0;
    if (effUsed > effTotal) {
      return NextResponse.json(
        { error: "`couponsUsed` can't exceed `couponsTotal`." },
        { status: 400 },
      );
    }
  }

  // Require at least one real field beyond the two audit stamps.
  if (Object.keys(updates).length <= 2) {
    return NextResponse.json(
      { error: "No valid fields to update." },
      { status: 400 },
    );
  }

  try {
    await getAdminDb().doc(DOC_PATH).set(updates, { merge: true });
  } catch (err) {
    console.error("[agency/exit-intent-config] write failed", err);
    return NextResponse.json({ error: "Save failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
