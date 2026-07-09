import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { provisionBetaOwner } from "@/lib/auth/provision-beta-owner";

/**
 * POST /api/auth/repair-workspace
 *
 * Self-heal for a signed-in, active user whose account somehow has no
 * tenancy: no `agencyId` custom claim and no `users/{uid}.primaryAgencyId`.
 * This shouldn't happen on the happy path (every signup route — email/
 * password and OAuth via /api/auth/oauth-provision — provisions an agency
 * before returning), but a partial failure upstream (e.g. a client that
 * navigated away before its claims finished propagating, or an account
 * created outside the normal signup flow) can leave a user stuck seeing
 * "sign in to view your agency" despite being fully authenticated.
 *
 * Idempotent: if the user already has a home agency (via claims or the
 * Firestore doc), this just returns it — it never mints a second one.
 *
 * Auth: caller must be signed in (x-user-uid header set by middleware).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const auth = getAdminAuth();
  const db = getAdminDb();

  let userRecord;
  try {
    userRecord = await auth.getUser(uid);
  } catch {
    return NextResponse.json({ error: "User account not found" }, { status: 404 });
  }

  const email = userRecord.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "User account has no email" }, { status: 400 });
  }

  const existingAgencyId = userRecord.customClaims?.agencyId as string | undefined;
  const userSnap = await db.doc(`users/${uid}`).get();
  const userDoc = userSnap.exists ? userSnap.data() : null;

  // Already has a home agency somewhere — nothing to repair. Return
  // whichever source has it so the client can just re-sync.
  const agencyId = existingAgencyId || (userDoc?.primaryAgencyId as string | undefined);
  if (agencyId) {
    return NextResponse.json({ repaired: false, agencyId });
  }

  // Never got an active user doc at all — this isn't a repairable "no
  // tenancy" case, it's a genuinely missing account. Don't silently
  // provision a workspace for something that failed for another reason.
  if (userDoc && userDoc.status !== "active") {
    return NextResponse.json(
      { error: "This account isn't active. Contact your agency owner." },
      { status: 403 },
    );
  }

  const displayName =
    userRecord.displayName?.trim() || email.split("@")[0] || "AgentStack user";

  try {
    const { agencyId: newAgencyId, subAccountId } = await provisionBetaOwner({
      auth,
      db,
      uid,
      email,
      displayName,
      bootstrap: false,
    });
    return NextResponse.json({ repaired: true, agencyId: newAgencyId, subAccountId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not set up your workspace. Contact support.",
      },
      { status: 500 },
    );
  }
}
