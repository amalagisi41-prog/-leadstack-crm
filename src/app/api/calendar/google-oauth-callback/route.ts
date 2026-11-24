import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import {
  loadCalendarSecrets,
  writeCalendarSecrets,
} from "@/lib/comms/sub-account-secrets";
import { verifyCalendarOAuthState } from "@/lib/calendar/oauth-state";

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type GoogleUserInfo = {
  email?: string;
  name?: string;
};

export async function GET(request: NextRequest) {
  const base = request.nextUrl.origin;
  const state = request.nextUrl.searchParams.get("state");
  const verifiedState = state ? verifyCalendarOAuthState(state) : null;
  const redirect = (id: string, error?: string) =>
    NextResponse.redirect(
      new URL(
        id
          ? `/sa/${id}/dashboard/settings?calendar_oauth=${error ? "error" : "success"}${error ? `&calendar_oauth_error=${encodeURIComponent(error)}` : ""}`
          : `/?oauth_error=calendar_${encodeURIComponent(error ?? "server_error")}`,
        base,
      ),
    );

  try {
    const code = request.nextUrl.searchParams.get("code");
    if (request.nextUrl.searchParams.get("error")) {
      return redirect(verifiedState?.subAccountId ?? "", "access_denied");
    }
    if (!code || !state) return redirect(verifiedState?.subAccountId ?? "", "missing_params");

    const verified = verifiedState;
    if (!verified || verified.provider !== "google") return redirect("", "invalid_state");

    const session = (await cookies()).get("__session")?.value;
    if (!session) return redirect(verified.subAccountId, "unauthorized");
    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    const membership = await getAdminDb()
      .doc(`subAccounts/${verified.subAccountId}/subAccountMembers/${decoded.uid}`)
      .get();
    const member = membership.data() as { role?: string; status?: string } | undefined;
    if (!membership.exists || member?.role !== "admin" || member.status !== "active") {
      return redirect(verified.subAccountId, "unauthorized");
    }

    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    if (!clientId || !clientSecret) return redirect(verified.subAccountId, "not_configured");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? base;
    const redirectUri = appUrl.replace(/\/$/, "") + "/api/calendar/google-oauth-callback";
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return redirect(verified.subAccountId, "token_exchange_failed");

    const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
    const existingSecrets = await loadCalendarSecrets(verified.subAccountId, "google");
    const refreshToken = tokens.refresh_token ?? existingSecrets?.refreshToken;
    if (!refreshToken) return redirect(verified.subAccountId, "refresh_token_missing");

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!userInfoResponse.ok) return redirect(verified.subAccountId, "userinfo_failed");
    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;

    const db = getAdminDb();
    await writeCalendarSecrets(verified.subAccountId, {
      provider: "google",
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
    await db.doc(`subAccounts/${verified.subAccountId}`).update({
      calendarConfig: {
        provider: "google",
        status: "connected",
        email: userInfo.email ?? "",
        displayName: userInfo.name ?? null,
        connectedAt: new Date(),
        connectedByUid: decoded.uid,
      },
    });

    return redirect(verified.subAccountId);
  } catch (error) {
    console.error("[calendar/google-oauth-callback] Error:", error);
    return redirect(verifiedState?.subAccountId ?? "", "server_error");
  }
}
