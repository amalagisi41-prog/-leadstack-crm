import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  deleteCommentServerSide,
  getCommentAuthor,
} from "@/lib/server/community-feed-service";

export const dynamic = "force-dynamic";

/** Member: delete a comment (its author) or moderator. */
export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      saId: string;
      groupId: string;
      postId: string;
      commentId: string;
    }>;
  },
) {
  const { saId, groupId, postId, commentId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const authorId = await getCommentAuthor({
    subAccountId: saId,
    groupId,
    postId,
    commentId,
  });
  if (!authorId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  const isAuthor = authorId === access.member.id;
  if (!isAuthor && access.membership.role !== "moderator") {
    return NextResponse.json(
      { error: "You can only delete your own comments" },
      { status: 403 },
    );
  }

  await deleteCommentServerSide({ subAccountId: saId, groupId, postId, commentId });
  return NextResponse.json({ ok: true });
}
