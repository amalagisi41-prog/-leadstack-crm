import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  sanitizeAdAccountPayload,
  type CreateAdAccountPayload,
} from "@/lib/ad-accounts/sanitize";
import { DEFAULT_AD_ACCOUNT } from "@/types/ad-accounts";
import type { AdAccountDoc } from "@/types/ad-accounts";

export const dynamic = "force-dynamic";

/**
 * POST /api/sub-accounts/[id]/ad-accounts
 *
 * Create a new ad platform account row on the sub-account's "Ad Spend &
 * Billing" page. Admin-only (unlike Products, which any member can create) —
 * this is billing data. v1 is manual entry only; `source` is always
 * "manual" regardless of what the caller sends.
 *
 * Body shape (all optional except platform + label):
 *   { platform: "meta"|"google"|"other", label: string, monthlySpendCents?: number, currency?: string, notes?: string }
 *
 * Returns: `{ id }` on success.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;

  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: CreateAdAccountPayload;
  try {
    body = (await request.json()) as CreateAdAccountPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sanitized = sanitizeAdAccountPayload(body);
  if (!sanitized.platform || !sanitized.label) {
    return NextResponse.json(
      { error: "platform and label are required" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const agencyId =
    access.agencyId ?? (subSnap.data()?.agencyId as string | undefined);
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing an agencyId" },
      { status: 500 },
    );
  }

  const docRef = db.collection("adAccounts").doc();
  const doc: Omit<AdAccountDoc, "id"> = {
    ...DEFAULT_AD_ACCOUNT,
    agencyId,
    subAccountId,
    createdByUid: access.uid,
    ...sanitized,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    await docRef.set(doc);
  } catch (err) {
    console.error("[ad-accounts/create] write failed", err);
    return NextResponse.json(
      { error: "Failed to create ad account" },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: docRef.id }, { status: 201 });
}
