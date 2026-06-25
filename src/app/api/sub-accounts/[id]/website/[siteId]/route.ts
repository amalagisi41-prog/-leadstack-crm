import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * DELETE a website.
 *
 *   ?reset=1  → reset the doc to draft (the "Rebuild" action). Clears
 *               gitpageJobId / liveUrl / status / errors so the operator can
 *               edit the form and submit a new build. The previously-published
 *               GitHub repo stays live until manually deleted on gitpage's
 *               side — v1 doesn't tear down on rebuild. Config is preserved.
 *
 *   (no flag) → permanently remove the website doc, freeing one of the
 *               sub-account's slots so a different site can be created. The
 *               previously-published repo (if any) likewise stays live.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; siteId: string }> },
) {
  const { id: subAccountId, siteId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const reset = new URL(request.url).searchParams.get("reset") === "1";

  const db = getAdminDb();
  const docRef = db.doc(`subAccounts/${subAccountId}/website/${siteId}`);
  const snap = await docRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "No website to remove." }, { status: 404 });
  }

  if (reset) {
    await docRef.update({
      status: "draft",
      gitpageJobId: null,
      liveUrl: null,
      errorMessage: null,
      partialErrors: null,
      pollAttempts: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, reset: true });
  }

  await docRef.delete();
  return NextResponse.json({ ok: true, removed: true });
}
