import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { SocialPostDoc } from "@/types";

/**
 * Delete a Social Planner post. Sub-account admin only.
 *
 * If the post was scheduled, its QStash job may still fire — the publish step
 * is a no-op when the doc is gone, so deleting is a safe cancel. Already-
 * published posts are removed from the calendar only; the live FB/IG post is
 * NOT deleted from the platform (deleting remotely is a v2 nicety).
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; postId: string }> },
) {
  const { id: subAccountId, postId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.doc(`socialPosts/${postId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  const post = snap.data() as Omit<SocialPostDoc, "id">;
  // Tenancy guard — never let one sub-account delete another's post.
  if (post.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  await ref.delete();
  return NextResponse.json({ ok: true, id: postId });
}
