import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { listInboxServerSide } from "@/lib/server/community-dm-service";

export const dynamic = "force-dynamic";

/** Member: their DM inbox (thread list), for the inbox poll. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const items = await listInboxServerSide({
    subAccountId: saId,
    viewerId: access.member.id,
  });
  return NextResponse.json({ items });
}
