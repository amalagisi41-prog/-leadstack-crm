import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as { consent?: boolean };
  if (body.consent !== true) {
    return NextResponse.json({ error: "Permission is required before transfer begins." }, { status: 400 });
  }
  const ref = getAdminDb().doc(`subAccounts/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.ghlImportConfig?.authMethod !== "oauth") {
    return NextResponse.json({ error: "Connect your GoHighLevel account first." }, { status: 409 });
  }
  await ref.update({
    ghlWebsiteTransfer: {
      status: "assessment_queued",
      readOnlyPermissionGranted: true,
      grantedByUid: access.uid,
      grantedAt: FieldValue.serverTimestamp(),
      publishingRequiresSeparateApproval: true,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true, status: "assessment_queued" });
}
