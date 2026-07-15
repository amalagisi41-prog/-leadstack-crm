import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

export const dynamic = "force-dynamic";

/**
 * DELETE — removes a Knowledge Base source and its chunks subcollection.
 * Sub-account admin only.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id: subAccountId, sourceId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/knowledgeBase/${sourceId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  await db.recursiveDelete(ref);
  return NextResponse.json({ ok: true });
}
