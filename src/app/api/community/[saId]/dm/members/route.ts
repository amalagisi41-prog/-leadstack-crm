import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { listDmableMembersServerSide } from "@/lib/server/community-dm-service";

export const dynamic = "force-dynamic";

/** Member: list/search members the viewer can start a DM with. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const q = new URL(request.url).searchParams.get("q") ?? undefined;
  const members = await listDmableMembersServerSide({
    subAccountId: saId,
    viewerId: access.member.id,
    q,
  });
  return NextResponse.json({ members });
}
