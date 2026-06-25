import { NextResponse } from "next/server";
import { getCommunityGate } from "@/lib/community/gate";
import {
  signMemberSessionToken,
  verifyMemberMagicLinkToken,
} from "@/lib/community/member-auth";
import { ensureMember } from "@/lib/community/member-account";
import { setMemberSessionCookie } from "@/lib/community/member-session";
import {
  getGroupById,
  joinGroupServerSide,
} from "@/lib/server/community-service";

export const dynamic = "force-dynamic";

/**
 * Verify a magic-link token and exchange it for a 30-day session cookie,
 * creating (or reusing) the member identity + reconciling a contact on the way.
 * GET so the email link works on a single tap. Redirects into the community on
 * success, or back to the login page with an error param on failure.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const url = new URL(request.url);
  const loginUrl = (error: string) =>
    NextResponse.redirect(new URL(`/c/${saId}/login?error=${error}`, url));

  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = url.searchParams.get("token");
  if (!token) return loginUrl("missing_token");

  const verified = verifyMemberMagicLinkToken(token);
  if (!verified || verified.subAccountId !== saId) return loginUrl("expired");

  let memberId: string;
  try {
    const member = await ensureMember({
      subAccountId: saId,
      email: verified.email,
    });
    if (member.status !== "active") return loginUrl("inactive");
    memberId = member.id;
  } catch (err) {
    console.error("[community/login/verify] ensureMember failed", err);
    return loginUrl("error");
  }

  const sessionToken = signMemberSessionToken(saId, memberId, verified.email);
  await setMemberSessionCookie(sessionToken);

  // If they came to join a specific group, complete the join now so they land
  // INSIDE the community (Skool-style) rather than back on the join page.
  if (verified.joinGroupId) {
    const group = await getGroupById(saId, verified.joinGroupId);
    if (group && group.status === "published") {
      try {
        const outcome = await joinGroupServerSide({
          subAccountId: saId,
          agencyId: gate.agencyId,
          groupId: group.id,
          memberId,
        });
        if (outcome.status === "active" || outcome.status === "already") {
          return NextResponse.redirect(
            new URL(`/c/${saId}/${group.slug}/community`, url),
          );
        }
      } catch (err) {
        console.error("[community/login/verify] auto-join failed", err);
      }
      // Approval / paid / error → land on the group's About to finish there.
      return NextResponse.redirect(new URL(`/c/${saId}/${group.slug}`, url));
    }
  }

  return NextResponse.redirect(new URL(`/c/${saId}`, url));
}
