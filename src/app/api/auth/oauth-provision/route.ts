import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { provisionBetaOwner } from "@/lib/auth/provision-beta-owner";
import { resolveAgencyAccess } from "@/lib/auth/resolve-agency-access";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!idToken) {
    return NextResponse.json({ error: "Missing identity token." }, { status: 401 });
  }

  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken).catch(() => null);
  if (!decoded?.uid || !decoded.email) {
    return NextResponse.json({ error: "Invalid social sign-in." }, { status: 401 });
  }

  const uid = decoded.uid;
  const email = decoded.email.trim().toLowerCase();
  const resolved = await resolveAgencyAccess(uid);
  if (resolved) {
    const legacyRole =
      resolved.agencyRole === "owner" ? "admin" : "collaborator";

    // Repair stale/missing tenancy claims whenever an existing user signs in.
    // This is especially important after Firebase Admin credentials are fixed:
    // the account may exist while the browser token still lacks agencyId.
    await auth.setCustomUserClaims(uid, {
      role: legacyRole,
      status: resolved.status,
      agencyId: resolved.agencyId,
      agencyRole: resolved.agencyRole,
    });
    return NextResponse.json({
      redirectTo: resolved.agencyRole === "owner" ? "/agency" : "/dashboard",
      existing: true,
      agencyId: resolved.agencyId,
      recoveredAgencyId: resolved.repairedPrimaryAgencyId,
    });
  }

  const db = getAdminDb();
  const userRecord = await auth.getUser(uid);
  const displayName =
    userRecord.displayName?.trim() || email.split("@")[0] || "AgentStack user";

  try {
    const { agencyId, subAccountId } = await provisionBetaOwner({
      auth,
      db,
      uid,
      email,
      displayName,
      bootstrap: false,
    });
    return NextResponse.json({
      redirectTo: "/agency/get-started",
      agencyId,
      subAccountId,
      existing: false,
    });
  } catch (error) {
    await auth.deleteUser(uid).catch(() => undefined);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create your beta workspace.",
      },
      { status: 500 },
    );
  }
}
