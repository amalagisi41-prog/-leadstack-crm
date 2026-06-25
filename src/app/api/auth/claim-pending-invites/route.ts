import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

/**
 * POST /api/auth/claim-pending-invites
 *
 * Scan the `invites` collection for any pending sub-account invites
 * matching the caller's email and attach the corresponding memberships
 * to their existing user account.
 *
 * Why this exists separately from /api/auth/signup:
 *   - signup creates a brand-new Firebase Auth user; it 409s on existing
 *     emails and never reaches the invite-attach code.
 *   - This route handles the "Sarah already has an account, now she's
 *     invited to a second sub-account" path. Idempotent: running it
 *     twice doesn't double-write.
 *
 * Auth: caller must be signed in. We read uid from the x-user-uid header
 * (set by middleware) and pull the email straight off the Firebase Auth
 * record (not the header) so a stale/missing header can't spoof which
 * invites get claimed.
 *
 * Returns: `{ attached: [{ subAccountId, name }] }` — the list of
 * memberships newly attached this call. Empty array when nothing was
 * pending.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const auth = getAdminAuth();
  let userRecord;
  try {
    userRecord = await auth.getUser(uid);
  } catch {
    return NextResponse.json(
      { error: "User account not found" },
      { status: 404 },
    );
  }
  const email = userRecord.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json(
      { error: "User account has no email" },
      { status: 400 },
    );
  }

  const db = getAdminDb();

  // Scan for pending invites matching this email. Composite index needed
  // on (email, acceptedByUid, revokedAt). If the deployment hasn't built
  // it yet, Firestore returns an indexing-needed error in dev — surface
  // it instead of swallowing.
  const inviteSnaps = await db
    .collection("invites")
    .where("email", "==", email)
    .where("acceptedByUid", "==", null)
    .where("revokedAt", "==", null)
    .get();

  if (inviteSnaps.empty) {
    return NextResponse.json({ attached: [] });
  }

  const attached: Array<{ subAccountId: string; name: string }> = [];

  // Process each invite in its own batch so a single bad doc doesn't
  // block the rest. Each batch is small (3 writes) so this stays cheap.
  for (const inviteDoc of inviteSnaps.docs) {
    const invite = inviteDoc.data() as {
      email: string;
      agencyId: string;
      subAccountId: string | null;
      subAccountRole: "admin" | "collaborator" | null;
      agencyRole: "owner" | "staff" | null;
      invitedByUid: string;
    };
    if (!invite.subAccountId || !invite.subAccountRole) {
      // Agency-level invites aren't in scope for this helper. Skip.
      continue;
    }

    // Idempotency: if the membership already exists (e.g. claimed in a
    // prior call but the invite update silently failed), still mark the
    // invite accepted so it stops showing up.
    const memberRef = db.doc(
      `subAccounts/${invite.subAccountId}/subAccountMembers/${uid}`,
    );
    const memberSnap = await memberRef.get();

    const subSnap = await db.doc(`subAccounts/${invite.subAccountId}`).get();
    const subName = (subSnap.data()?.name as string) ?? "Sub-account";

    const batch = db.batch();

    if (!memberSnap.exists) {
      batch.set(memberRef, {
        uid,
        subAccountId: invite.subAccountId,
        agencyId: invite.agencyId,
        role: invite.subAccountRole,
        status: "active",
        email,
        displayName: userRecord.displayName ?? "",
        addedAt: FieldValue.serverTimestamp(),
        addedByUid: invite.invitedByUid,
      });

      batch.set(
        db.doc(`userMemberships/${uid}/subAccounts/${invite.subAccountId}`),
        {
          subAccountId: invite.subAccountId,
          agencyId: invite.agencyId,
          role: invite.subAccountRole,
          name: subName,
          addedAt: FieldValue.serverTimestamp(),
        },
      );

      attached.push({ subAccountId: invite.subAccountId, name: subName });
    }

    batch.update(inviteDoc.ref, {
      acceptedByUid: uid,
      acceptedAt: FieldValue.serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (err) {
      console.error(
        `[claim-pending-invites] commit failed for invite ${inviteDoc.id}`,
        err,
      );
      // Continue with the next invite — don't fail the whole call.
    }
  }

  return NextResponse.json({ attached });
}
