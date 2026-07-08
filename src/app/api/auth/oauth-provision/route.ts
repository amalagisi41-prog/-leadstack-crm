import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { provisionBetaOwner } from "@/lib/auth/provision-beta-owner";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!idToken) {
    return NextResponse.json({ error: "Missing identity token." }, { status: 401 });
  }

  const auth = getAdminAuth();
  const db = getAdminDb();
  const decoded = await auth.verifyIdToken(idToken).catch(() => null);
  if (!decoded?.uid || !decoded.email) {
    return NextResponse.json({ error: "Invalid social sign-in." }, { status: 401 });
  }

  const uid = decoded.uid;
  const email = decoded.email.trim().toLowerCase();
  const existing = await db.doc(`users/${uid}`).get();
  if (existing.exists) {
    const data = existing.data() ?? {};
    const agencyRole = (await auth.getUser(uid)).customClaims?.agencyRole;
    return NextResponse.json({
      redirectTo: agencyRole === "owner" ? "/agency" : "/dashboard",
      existing: true,
      agencyId: data.primaryAgencyId ?? null,
    });
  }

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
