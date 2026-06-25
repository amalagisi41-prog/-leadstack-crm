import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { unreadThreadCount } from "@/lib/server/community-dm-service";

export const dynamic = "force-dynamic";

/** Member: count of threads with unread messages (header badge poll). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
  const count = await unreadThreadCount({
    subAccountId: saId,
    viewerId: access.member.id,
  });
  return NextResponse.json({ count });
}
