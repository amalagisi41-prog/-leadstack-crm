import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { LANDING_VARIANT } from "@/config/landing";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import type { Referral } from "@/types/affiliate";

export const dynamic = "force-dynamic";

/**
 * Marks a single referral as paid. Atomically moves the commission amount
 * from the affiliate's `pendingCommissionCents` to `paidCommissionCents`
 * inside a Firestore transaction so the totals stay consistent even if
 * the same referral is double-clicked from the UI.
 *
 * Re-running on an already-paid referral is a no-op: the transaction
 * reads the current status first and bails if it's already "paid".
 */
export async function POST(request: Request) {
  if (LANDING_VARIANT !== "leadstack") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authed = await requireAgencyOwner(request);
  if (authed instanceof NextResponse) return authed;

  let body: { referralId?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const referralId = body.referralId?.trim();
  if (!referralId) {
    return NextResponse.json(
      { error: "referralId required" },
      { status: 400 },
    );
  }

  const note = body.note?.trim().slice(0, 500) ?? null;

  const db = getAdminDb();
  const referralRef = db.collection("referrals").doc(referralId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const referralSnap = await tx.get(referralRef);
      if (!referralSnap.exists) {
        return { ok: false as const, error: "Referral not found" };
      }
      const referral = referralSnap.data() as Omit<Referral, "id">;
      if (referral.status === "paid") {
        return { ok: false as const, error: "Already paid" };
      }
      if (referral.status === "voided") {
        return { ok: false as const, error: "Cannot pay a voided referral" };
      }

      const affiliateRef = db
        .collection("affiliates")
        .doc(referral.affiliateId);

      tx.update(referralRef, {
        status: "paid",
        paidOutAt: FieldValue.serverTimestamp(),
        paidOutNote: note,
      });
      tx.update(affiliateRef, {
        pendingCommissionCents: FieldValue.increment(-referral.commissionCents),
        paidCommissionCents: FieldValue.increment(referral.commissionCents),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { ok: true as const };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[affiliates/mark-paid] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
