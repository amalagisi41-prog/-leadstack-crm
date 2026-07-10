import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

/**
 * GET /api/auth/diagnose-workspace
 *
 * Read-only, self-scoped diagnostic for tracking down tenancy weirdness
 * (accounts that can use a sub-account directly but don't see it on
 * /agency or /agency/sub-accounts). Returns everything relevant about the
 * CALLER's own uid: custom claims, the users/{uid} doc, and every row in
 * their userMemberships subcollections. No other user's data is ever
 * touched. Temporary — safe to delete once the underlying issue is found.
 *
 * Auth: caller must be signed in (x-user-uid header set by middleware).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const auth = getAdminAuth();
  const db = getAdminDb();

  const userRecord = await auth.getUser(uid).catch(() => null);
  if (!userRecord) {
    return NextResponse.json({ error: "User account not found" }, { status: 404 });
  }

  const [userSnap, subAccountMemberships, agencyMemberships] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.collection(`userMemberships/${uid}/subAccounts`).get(),
    db.collection(`userMemberships/${uid}/agencies`).get(),
  ]);

  const subAccountRows: Record<string, unknown>[] = subAccountMemberships.docs.map(
    (d) => ({ docId: d.id, ...d.data() }),
  );
  const agencyRows: Record<string, unknown>[] = agencyMemberships.docs.map(
    (d) => ({ docId: d.id, ...d.data() }),
  );

  // Cross-check: for every sub-account membership row, and separately for
  // every agency the user claims, look up the ACTUAL subAccounts docs whose
  // agencyId matches -- this is how we tell "no memberships exist" apart
  // from "memberships exist but point at a different agency than the
  // active claim."
  const agencyIdsToCheck = new Set<string>();
  if (userRecord.customClaims?.agencyId) {
    agencyIdsToCheck.add(userRecord.customClaims.agencyId as string);
  }
  const userDocAgencyId = userSnap.exists ? userSnap.data()?.primaryAgencyId : undefined;
  if (userDocAgencyId) agencyIdsToCheck.add(userDocAgencyId as string);
  for (const row of subAccountRows) {
    if (typeof row.agencyId === "string") agencyIdsToCheck.add(row.agencyId);
  }
  for (const row of agencyRows) {
    if (typeof row.agencyId === "string") agencyIdsToCheck.add(row.agencyId);
  }

  const subAccountsByAgency: Record<string, unknown[]> = {};
  await Promise.all(
    Array.from(agencyIdsToCheck).map(async (agencyId) => {
      const snap = await db
        .collection("subAccounts")
        .where("agencyId", "==", agencyId)
        .get();
      subAccountsByAgency[agencyId] = snap.docs.map((d) => ({
        docId: d.id,
        ...d.data(),
      }));
    }),
  );

  return NextResponse.json({
    uid,
    email: userRecord.email ?? null,
    // The Firebase project this SERVER (Admin SDK) is reading from. Compare
    // it against `clientProjectId` in the browser's stuck-workspace debug
    // box: if they differ, the client (NEXT_PUBLIC_FIREBASE_*) and server
    // (FIREBASE_ADMIN_*) point at different projects — the client can never
    // see data the server writes, no matter how many times you sign in.
    serverProjectId:
      auth.app.options.projectId ??
      process.env.FIREBASE_ADMIN_PROJECT_ID ??
      null,
    customClaims: userRecord.customClaims ?? null,
    userDoc: userSnap.exists ? userSnap.data() : null,
    userMembershipsSubAccounts: subAccountRows,
    userMembershipsAgencies: agencyRows,
    // For each agency id seen anywhere above, the actual sub-account docs
    // that exist under it -- reveals orphaned agencies with real
    // sub-accounts that never made it into userMemberships, or an active
    // claim pointing at an agency with zero sub-accounts.
    subAccountsByAgencyId: subAccountsByAgency,
  });
}
