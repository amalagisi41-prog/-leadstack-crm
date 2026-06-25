import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { setBlockServerSide } from "@/lib/server/community-dm-service";

export const dynamic = "force-dynamic";

/** Member: block / un-block another member. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: { otherId?: string; blocked?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.otherId) {
    return NextResponse.json({ error: "Missing member" }, { status: 400 });
  }

  await setBlockServerSide({
    subAccountId: saId,
    blockerId: access.member.id,
    blockedId: body.otherId,
    blocked: body.blocked !== false,
  });
  return NextResponse.json({ ok: true });
}
