import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createCommentServerSide } from "@/lib/server/community-feed-service";

export const dynamic = "force-dynamic";

/** Member: comment on a post. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; postId: string }> },
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: { body?: string; parentId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = body.body?.trim();
  if (!text) {
    return NextResponse.json({ error: "Write a comment first" }, { status: 400 });
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }
  const parentId =
    typeof body.parentId === "string" && body.parentId.trim()
      ? body.parentId.trim()
      : null;

  const comment = await createCommentServerSide({
    subAccountId: saId,
    groupId,
    postId,
    authorMemberId: access.member.id,
    body: text,
    parentId,
  });
  return NextResponse.json({ ok: true, comment });
}
