import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { getAdminAuth } from "@/lib/firebase/admin";

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

    // Decode state
    let stateData: { subAccountId: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return NextResponse.redirect(
        new URL("/sa?email_oauth_error=invalid_state", request.nextUrl.origin)
      );
    }

    const { subAccountId } = stateData;

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

    const membership = membershipDoc.data() as { role?: string };
    if (membership.role !== "admin") {
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

    // Store the configuration
    const subAccountRef = db.collection("subAccounts").doc(subAccountId);
    await subAccountRef.update({
      googleWorkspaceConfig: {
        status: "connected",
        senderEmail: userInfo.email,
        senderName: userInfo.name,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
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
