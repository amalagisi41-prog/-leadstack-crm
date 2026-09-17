import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/sub-accounts/[id]/billing
 *
 * Sets what this client pays the agency each month
 * (`SubAccountDoc.monthlyRetainerCents`). Manual figure — see the field's
 * doc comment in src/types/tenancy.ts for why there's no live source for it.
 * Admin-only. Pass `monthlyRetainerCents: null` to clear it.
 *
 * Body: { monthlyRetainerCents: number | null, currency?: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;

  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { monthlyRetainerCents?: unknown; currency?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    monthlyRetainerUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (body.monthlyRetainerCents === null) {
    update.monthlyRetainerCents = null;
  } else if (
    typeof body.monthlyRetainerCents === "number" &&
    Number.isFinite(body.monthlyRetainerCents)
  ) {
    update.monthlyRetainerCents = Math.max(
      0,
      Math.round(body.monthlyRetainerCents),
    );
  } else {
    return NextResponse.json(
      { error: "monthlyRetainerCents must be a number or null" },
      { status: 400 },
    );
  }

  if (typeof body.currency === "string" && body.currency.trim()) {
    update.monthlyRetainerCurrency = body.currency.trim().toUpperCase().slice(0, 3);
  }

  try {
    await getAdminDb().doc(`subAccounts/${subAccountId}`).update(update);
  } catch (err) {
    console.error("[billing/update] write failed", err);
    return NextResponse.json(
      { error: "Failed to update billing" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
