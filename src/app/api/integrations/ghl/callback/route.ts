import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  exchangeGhlCode,
  ghlOAuthConfigured,
  verifyGhlState,
} from "@/lib/import/ghl/oauth";
import { validateGhlAccess } from "@/lib/import/ghl/client";

function appBase(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  ).replace(/\/$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const verified = state ? verifyGhlState(state) : null;
  if (!verified)
    return NextResponse.redirect(
      new URL("/dashboard?ghl=bad_state", appBase(request))
    );
  const id = verified.subAccountId;
  const finish = (status: string) => {
    const destination = new URL(`/sa/${id}/import`, appBase(request));
    destination.searchParams.set("source", "ghl");
    destination.searchParams.set("ghl", status);
    return NextResponse.redirect(destination);
  };
  if (!code || url.searchParams.get("error")) return finish("cancelled");
  if (!ghlOAuthConfigured()) return finish("not_configured");
  try {
    // HighLevel may complete OAuth in the system browser while AgentStack is
    // running as an installed app. Those two browser contexts do not reliably
    // share the AgentStack session cookie. The signed state identifies the
    // initiating user; verify that user is still an admin before storing any
    // token instead of requiring a cookie on the returning browser.
    const db = getAdminDb();
    const [subSnap, memberSnap] = await Promise.all([
      db.doc(`subAccounts/${id}`).get(),
      db.doc(`subAccounts/${id}/subAccountMembers/${verified.uid}`).get(),
    ]);
    if (!subSnap.exists) return finish("bad_state");
    const sub = subSnap.data() ?? {};
    const member = memberSnap.data() ?? {};
    const isSubAdmin = member.status === "active" && member.role === "admin";
    let isAgencyOwner = false;
    if (sub.agencyId) {
      const agencyMember = await db
        .doc(`agencies/${sub.agencyId}/agencyMembers/${verified.uid}`)
        .get();
      const agencyData = agencyMember.data() ?? {};
      isAgencyOwner =
        agencyMember.exists &&
        agencyData.status === "active" &&
        agencyData.role === "owner";
    }
    if (!isSubAdmin && !isAgencyOwner) return finish("bad_state");

    const redirectUri = `${appBase(request)}/api/integrations/business-transfer/callback`;
    const token = await exchangeGhlCode(code, redirectUri);
    await validateGhlAccess(token.accessToken, token.locationId!);
    await db.doc(`subAccounts/${id}`).update({
      ghlImportConfig: {
        token: token.accessToken,
        refreshToken: token.refreshToken,
        locationId: token.locationId,
        companyId: token.companyId ?? null,
        scope: token.scope ?? "",
        oauthUserId: token.userId ?? null,
        authMethod: "oauth",
        tokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000),
        connectedByUid: verified.uid,
        connectedAt: FieldValue.serverTimestamp(),
        lastValidatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return finish("connected");
  } catch (error) {
    console.error(`[ghl/oauth] connection failed sa=${id}`, error);
    return finish("error");
  }
}
