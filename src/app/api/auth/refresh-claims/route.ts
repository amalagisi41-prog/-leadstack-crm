import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

/**
 * Re-emit the caller's custom claims from their current Firestore state.
 *
 * Called from the client after a membership change (added to a new sub-account,
 * promoted, removed) so the JWT picks up the new agencyId / agencyRole / status
 * without waiting for the 60-min token-refresh ceiling.
 *
 * Authoritative inputs:
 *   - users/{uid}.status                     -> status claim
 *   - users/{uid}.primaryAgencyId            -> agencyId claim
 *   - agencies/{agencyId}/agencyMembers/{uid}.role -> agencyRole claim ("owner" | "staff")
 *
 * Per-sub-account memberships do NOT live on the JWT (Firestore claim size
 * cap). They are read by Firestore rules via get() instead.
 */
export async function POST(request: Request) {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getAdminDb();
  const auth = getAdminAuth();

  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    return NextResponse.json({ error: "No user record" }, { status: 404 });
  }
  const user = userSnap.data() ?? {};
  const status = user.status === "removed" ? "removed" : "active";
  const agencyId = (user.primaryAgencyId as string | null) ?? null;

  let agencyRole: "owner" | "staff" | null = null;
  if (agencyId) {
    const memberSnap = await db
      .doc(`agencies/${agencyId}/agencyMembers/${uid}`)
      .get();
    if (memberSnap.exists) {
      const role = memberSnap.data()?.role;
      if (role === "owner" || role === "staff") {
        agencyRole = role;
      }
    }
  }

  // Legacy "role" claim — kept until the dashboard pages migrate off it.
  const legacyRole =
    agencyRole === "owner"
      ? "admin"
      : ((user.role as "admin" | "collaborator" | undefined) ?? "collaborator");

  await auth.setCustomUserClaims(uid, {
    role: legacyRole,
    status,
    agencyId,
    agencyRole,
  });

  return NextResponse.json({
    ok: true,
    claims: { role: legacyRole, status, agencyId, agencyRole },
  });
}
