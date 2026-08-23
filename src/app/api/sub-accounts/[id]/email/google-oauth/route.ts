import "server-only";

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { signGoogleOAuthState } from "@/lib/comms/google-oauth-state";
import type { SubAccountDoc } from "@/types";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 }
    );
  }
  const subAccount = subSnap.data() as SubAccountDoc | undefined;
  if (!subAccount) {
    return NextResponse.json(
      { error: "Sub-account data not found" },
      { status: 404 }
    );
  }

  // Check if email domain gate is enabled
  if (subAccount.emailDomainEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Email setup is not enabled for this sub-account" },
      { status: 403 }
    );
  }

  // Verify Google OAuth credentials are configured
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const _clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !_clientSecret) {
    return NextResponse.json(
      { error: "Google OAuth is not configured on this deployment" },
      { status: 503 }
    );
  }

  // Build the OAuth authorization URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/email/google-oauth-callback`;

  const searchParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    // HMAC-signed so the callback can trust that `state` came from this route
    // and names this sub-account. The previous version was unsigned base64
    // with a Math.random() nonce the callback never checked, which left the
    // connect flow open to CSRF — an attacker could get an admin to attach
    // the attacker's Google account to the victim's sub-account. Mirrors the
    // Meta connect flow (lib/comms/meta.ts::signMetaState).
    state: signGoogleOAuthState(
      subAccountId,
      crypto.randomBytes(16).toString("hex"),
    ),
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${searchParams}`;

  return NextResponse.json({ authUrl });
}
