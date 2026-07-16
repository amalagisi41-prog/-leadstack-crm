import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { resolveAgencyAccess } from "@/lib/auth/resolve-agency-access";

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

  const auth = getAdminAuth();
  const resolved = await resolveAgencyAccess(uid);
  if (!resolved) {
    return NextResponse.json({ error: "No user record" }, { status: 404 });
  }

  // Legacy "role" claim — kept until the dashboard pages migrate off it.
  const userRole = resolved.agencyRole === "owner" ? "admin" : "collaborator";
  const legacyRole =
    userRole ?? "collaborator";

  await auth.setCustomUserClaims(uid, {
    role: legacyRole,
    status: resolved.status,
    agencyId: resolved.agencyId,
    agencyRole: resolved.agencyRole,
  });

  return NextResponse.json({
    ok: true,
    recoveredAgencyId: resolved.repairedPrimaryAgencyId,
    claims: {
      role: legacyRole,
      status: resolved.status,
      agencyId: resolved.agencyId,
      agencyRole: resolved.agencyRole,
    },
  });
}
