import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { markThreadReadServerSide } from "@/lib/server/community-dm-service";

export const dynamic = "force-dynamic";

/** Member: mark a thread read up to now. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; threadId: string }> },
) {
  const { saId, threadId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  await markThreadReadServerSide({
    subAccountId: saId,
    threadId,
    viewerId: access.member.id,
  });
  return NextResponse.json({ ok: true });
}
