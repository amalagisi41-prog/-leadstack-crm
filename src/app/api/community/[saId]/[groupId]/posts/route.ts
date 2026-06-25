import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createPostServerSide } from "@/lib/server/community-feed-service";

export const dynamic = "force-dynamic";

/** Member: create a feed post. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: { title?: string; body?: string; category?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.body?.trim();
  if (!text) {
    return NextResponse.json({ error: "Write something first" }, { status: 400 });
  }
  if (text.length > 10000) {
    return NextResponse.json({ error: "Post is too long" }, { status: 400 });
  }

  // Category must be one the group defines (or none).
  const category =
    body.category && access.group.categories.includes(body.category)
      ? body.category
      : null;

  const post = await createPostServerSide({
    subAccountId: saId,
    agencyId: access.gate.agencyId,
    groupId,
    authorMemberId: access.member.id,
    title: body.title?.trim() ?? "",
    body: text,
    category,
  });

  return NextResponse.json({ ok: true, post });
}
