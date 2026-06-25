import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  deletePostServerSide,
  setPinnedServerSide,
} from "@/lib/server/community-feed-service";
import { getGroupById } from "@/lib/server/community-service";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** Member (moderator): pin / unpin a post. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; postId: string }> },
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

  let body: { pinned?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await setPinnedServerSide({
    subAccountId: saId,
    groupId,
    postId,
    pinned: body.pinned === true,
  });
  return NextResponse.json({ ok: true, pinned: body.pinned === true });
}

/** Member: delete a post (author) or moderator. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; postId: string }> },
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  // Confirm the group still resolves (defensive) + read the post author.
  await getGroupById(saId, groupId);
  const snap = await getAdminDb()
    .doc(`subAccounts/${saId}/communityGroups/${groupId}/posts/${postId}`)
    .get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  const isAuthor = snap.data()!.authorMemberId === access.member.id;
  if (!isAuthor && access.membership.role !== "moderator") {
    return NextResponse.json(
      { error: "You can only delete your own posts" },
      { status: 403 },
    );
  }

  await deletePostServerSide({ subAccountId: saId, groupId, postId });
  return NextResponse.json({ ok: true });
}
