import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * PATCH /api/sub-accounts/[id]/creative-config
 * Body: { placidTemplateId: string | null }
 *
 * Not a secret — Placid auth is the agency-level PLACID_API_TOKEN env var.
 * This just records which of the operator's own Placid templates (designed
 * in Placid's editor) to fill per listing.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  let body: { placidTemplateId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.placidTemplateId !== null && typeof body.placidTemplateId !== "string") {
    return NextResponse.json(
      { error: "`placidTemplateId` must be a string or null." },
      { status: 400 }
    );
  }

  await getAdminDb()
    .doc(`subAccounts/${id}`)
    .set(
      {
        placidTemplateId: body.placidTemplateId?.trim() || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return NextResponse.json({ ok: true, placidTemplateId: body.placidTemplateId || null });
}
