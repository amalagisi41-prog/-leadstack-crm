import "server-only";

import { NextResponse } from "next/server";
import { requireCommunityStaff } from "@/lib/community/staff-guard";
import {
  approveMembershipServerSide,
  setMembershipRoleServerSide,
  setMembershipStatusServerSide,
} from "@/lib/server/community-service";

export const dynamic = "force-dynamic";

/** Staff: approve a pending join request, or remove a member. */
export async function PATCH(
  request: Request,
  ctx: {
    params: Promise<{ id: string; groupId: string; memberId: string }>;
  },
) {
  const { id: subAccountId, groupId, memberId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { action?: "approve" | "remove" | "promote" | "demote" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "approve") {
    await approveMembershipServerSide({
      subAccountId,
      groupId,
      memberId,
      agencyId: access.resolvedAgencyId,
    });
  } else if (body.action === "remove") {
    await setMembershipStatusServerSide({
      subAccountId,
      groupId,
      memberId,
      status: "removed",
    });
  } else if (body.action === "promote" || body.action === "demote") {
    await setMembershipRoleServerSide({
      subAccountId,
      groupId,
      memberId,
      role: body.action === "promote" ? "moderator" : "member",
    });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
