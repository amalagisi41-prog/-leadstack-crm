import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * Cancel a pending invite — soft-delete by stamping `revokedAt`. The members
 * list query already filters `revokedAt == null`, so the row drops out of
 * the UI on the next snapshot.
 *
 * Caller must be agency owner or admin of the target sub-account. The route
 * also verifies the invite belongs to this sub-account so an admin of one
 * sub-account can't reach across the agency to revoke another's invites.
 *
 * If the invite has already been accepted, the right tool is the member
 * removal flow at /api/sub-accounts/[id]/members/[uid]; this returns 409.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; inviteId: string }> },
) {
  const { id: subAccountId, inviteId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.doc(`invites/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  const invite = snap.data() ?? {};
  if (invite.subAccountId !== subAccountId) {
    // Don't reveal that the invite exists in another sub-account — return
    // the same 404 the wrong-id case would.
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.acceptedByUid) {
    return NextResponse.json(
      {
        error:
          "Invite already accepted. Remove the member from the Members list instead.",
      },
      { status: 409 },
    );
  }
  if (invite.revokedAt) {
    // Idempotent: already revoked, nothing to do.
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await ref.update({
    revokedAt: FieldValue.serverTimestamp(),
    revokedByUid: access.uid,
  });

  return NextResponse.json({ ok: true });
}
