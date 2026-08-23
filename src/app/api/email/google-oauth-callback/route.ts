import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { getAdminAuth } from "@/lib/firebase/admin";
import { verifyGoogleOAuthState } from "@/lib/comms/google-oauth-state";
import { writeGoogleWorkspaceSecrets } from "@/lib/comms/sub-account-secrets";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface UserInfoResponse {
  email: string;
  name: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        new URL(`/sa?email_oauth_error=${error}`, request.nextUrl.origin)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/sa?email_oauth_error=missing_params", request.nextUrl.origin)
      );
    }

    // Verify the HMAC-signed state. Rejects any `state` we did not mint,
    // which is what stops an attacker from attaching their own Google account
    // to someone else's sub-account.
    const verified = verifyGoogleOAuthState(state);
    if (!verified) {
      return NextResponse.redirect(
        new URL("/sa?email_oauth_error=invalid_state", request.nextUrl.origin)
      );
    }

    const { subAccountId } = verified;

    // Verify user is authenticated and has access
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("__session")?.value;

    if (!sessionCookie) {
      return NextResponse.redirect(
        new URL("/login", request.nextUrl.origin)
      );
    }

    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifySessionCookie(sessionCookie, true);
    } catch {
      return NextResponse.redirect(
        new URL("/login", request.nextUrl.origin)
      );
    }

    // Verify user has access to the sub-account
    const db = getAdminDb();
    const membershipRef = db
      .collection("subAccounts")
      .doc(subAccountId)
      .collection("subAccountMembers")
      .doc(decodedToken.uid);

    const membershipDoc = await membershipRef.get();
    if (!membershipDoc.exists) {
      return NextResponse.redirect(
        new URL("/sa?email_oauth_error=unauthorized", request.nextUrl.origin)
      );
    }

    // Role AND status. Removal sets the membership row's status to "removed"
    // rather than deleting it, so checking only `role` would let a removed
    // admin still complete a connect.
    const membership = membershipDoc.data() as {
      role?: string;
      status?: string;
    };
    if (membership.role !== "admin" || membership.status !== "active") {
      return NextResponse.redirect(
        new URL("/sa?email_oauth_error=unauthorized", request.nextUrl.origin)
      );
    }

    // Exchange code for tokens
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/email/google-oauth-callback`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId || "",
        client_secret: clientSecret || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("[email/google-oauth-callback] Token exchange failed:", errorData);
      return NextResponse.redirect(
        new URL("/sa?email_oauth_error=token_exchange_failed", request.nextUrl.origin)
      );
    }

    const tokens = (await tokenResponse.json()) as TokenResponse;

    // Get user info
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!userInfoResponse.ok) {
      console.error("[email/google-oauth-callback] Failed to fetch user info");
      return NextResponse.redirect(
        new URL("/sa?email_oauth_error=userinfo_failed", request.nextUrl.origin)
      );
    }

    const userInfo = (await userInfoResponse.json()) as UserInfoResponse;

    // Store the SECRETS in the server-only subcollection. They must not go on
    // the sub-account document — that document is readable by every active
    // member including collaborators, and a Google refresh token grants
    // ongoing send-as access to the operator's real mailbox.
    await writeGoogleWorkspaceSecrets(subAccountId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    // Store only the PUBLIC half on the sub-account document, so the settings
    // UI can render the connected state without a privileged read.
    const subAccountRef = db.collection("subAccounts").doc(subAccountId);
    await subAccountRef.update({
      googleWorkspaceConfig: {
        status: "connected",
        senderEmail: userInfo.email,
        senderName: userInfo.name,
        connectedAt: new Date(),
        connectedByUid: decodedToken.uid,
      },
    });

    // Redirect back to the sub-account dashboard
    return NextResponse.redirect(
      new URL(`/sa/${subAccountId}/dashboard/settings?email_oauth=success`, request.nextUrl.origin)
    );
  } catch (error) {
    console.error("[email/google-oauth-callback] Error:", error);
    return NextResponse.redirect(
      new URL("/sa?email_oauth_error=server_error", request.nextUrl.origin)
    );
  }
}
