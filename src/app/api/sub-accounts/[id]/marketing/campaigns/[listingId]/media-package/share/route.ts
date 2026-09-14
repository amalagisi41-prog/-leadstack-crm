import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> },
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const briefSnap = await db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`).get();
  if (!briefSnap.exists) {
    return NextResponse.json(
      { error: "Create the property campaign before sharing its media package." },
      { status: 404 },
    );
  }

  const token = randomUUID().replaceAll("-", "");
  await db.doc(`mediaPackageShares/${token}`).set({
    token,
    subAccountId: id,
    listingId,
    createdByUid: access.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    ok: true,
    shareUrl: `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || origin}/media-package/${token}`,
  });
}
