import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
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
    state: Buffer.from(
      JSON.stringify({
        subAccountId,
        nonce: Math.random().toString(36).slice(2),
      })
    ).toString("base64"),
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${searchParams}`;

  return NextResponse.json({ authUrl });
}
