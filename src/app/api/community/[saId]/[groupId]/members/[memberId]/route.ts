import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  setMembershipRoleServerSide,
  setMembershipStatusServerSide,
} from "@/lib/server/community-service";

export const dynamic = "force-dynamic";

/**
 * Member-facing moderation of the directory: a MODERATOR can remove, ban /
 * un-ban, and promote / demote other members right from the Members page. Staff
 * also have these actions from the dashboard roster; this is the in-community
 * (Skool-style) equivalent, authorized by the actor's moderator membership.
 */
export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ saId: string; groupId: string; memberId: string }> },
) {
  const { saId, groupId, memberId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

  let body: { action?: "remove" | "ban" | "unban" | "promote" | "demote" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Don't let a moderator lock themselves out by removing/banning their own row.
  if (
    memberId === access.member.id &&
    (body.action === "remove" || body.action === "ban")
  ) {
    return NextResponse.json(
      { error: "You can't remove or ban yourself." },
      { status: 400 },
    );
  }

  switch (body.action) {
    case "remove":
      await setMembershipStatusServerSide({ subAccountId: saId, groupId, memberId, status: "removed" });
      break;
    case "ban":
      await setMembershipStatusServerSide({ subAccountId: saId, groupId, memberId, status: "banned" });
      break;
    case "unban":
      await setMembershipStatusServerSide({ subAccountId: saId, groupId, memberId, status: "active" });
      break;
    case "promote":
      await setMembershipRoleServerSide({ subAccountId: saId, groupId, memberId, role: "moderator" });
      break;
    case "demote":
      await setMembershipRoleServerSide({ subAccountId: saId, groupId, memberId, role: "member" });
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
