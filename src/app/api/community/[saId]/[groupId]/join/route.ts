import { NextResponse } from "next/server";
import { getCommunityGate } from "@/lib/community/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import { joinGroupServerSide } from "@/lib/server/community-service";

export const dynamic = "force-dynamic";

/**
 * Member: join a group. Requires an active member session scoped to this
 * sub-account. Free + open groups activate immediately; approval-policy groups
 * land pending; paid groups return `payment_required` (the one-time PayPal flow
 * lands in Slice 6).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;

  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  try {
    const outcome = await joinGroupServerSide({
      subAccountId: saId,
      agencyId: gate.agencyId,
      groupId,
      memberId: member.id,
    });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Join failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
