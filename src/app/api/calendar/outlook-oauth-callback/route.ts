import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { loadCalendarSecrets, writeCalendarSecrets } from "@/lib/comms/sub-account-secrets";
import { verifyCalendarOAuthState } from "@/lib/calendar/oauth-state";

type MicrosoftTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type MicrosoftProfile = {
  mail?: string | null;
  userPrincipalName?: string | null;
  displayName?: string | null;
};

export async function GET(request: NextRequest) {
  const base = request.nextUrl.origin;
  const redirect = (id: string, error?: string) =>
    NextResponse.redirect(
      new URL(
        id
          ? `/sa/${id}/dashboard/settings?calendar_oauth=${error ? "error" : "success"}${error ? `&calendar_oauth_error=${encodeURIComponent(error)}` : ""}`
          : "/sa?calendar_oauth_error=server_error",
        base,
      ),
    );

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (request.nextUrl.searchParams.get("error")) {
      const verified = state ? verifyCalendarOAuthState(state) : null;
      return redirect(verified?.subAccountId ?? "", "access_denied");
    }
    if (!code || !state) return redirect("", "missing_params");

    const verified = verifyCalendarOAuthState(state);
    if (!verified || verified.provider !== "outlook") return redirect("", "invalid_state");

    const session = (await cookies()).get("__session")?.value;
    if (!session) return redirect("", "unauthorized");
    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    const membership = await getAdminDb()
      .doc(`subAccounts/${verified.subAccountId}/subAccountMembers/${decoded.uid}`)
      .get();
    const member = membership.data() as { role?: string; status?: string } | undefined;
    if (!membership.exists || member?.role !== "admin" || member.status !== "active") {
      return redirect("", "unauthorized");
    }

    const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
    if (!clientId || !clientSecret) return redirect(verified.subAccountId, "not_configured");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? base;
    const redirectUri = appUrl.replace(/\/$/, "") + "/api/calendar/outlook-oauth-callback";
    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          scope: "openid profile email offline_access User.Read Calendars.ReadWrite",
        }),
      },
    );
    if (!tokenResponse.ok) return redirect(verified.subAccountId, "token_exchange_failed");

    const tokens = (await tokenResponse.json()) as MicrosoftTokenResponse;
    const existingSecrets = await loadCalendarSecrets(verified.subAccountId, "outlook");
    const refreshToken = tokens.refresh_token ?? existingSecrets?.refreshToken;
    if (!refreshToken) return redirect(verified.subAccountId, "refresh_token_missing");

    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) return redirect(verified.subAccountId, "profile_failed");
    const profile = (await profileResponse.json()) as MicrosoftProfile;

    await writeCalendarSecrets(verified.subAccountId, {
      provider: "outlook",
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
    await getAdminDb().doc(`subAccounts/${verified.subAccountId}`).update({
      calendarConfig: {
        provider: "outlook",
        status: "connected",
        email: profile.mail ?? profile.userPrincipalName ?? "",
        displayName: profile.displayName ?? null,
        connectedAt: new Date(),
        connectedByUid: decoded.uid,
      },
    });

    return redirect(verified.subAccountId);
  } catch (error) {
    console.error("[calendar/outlook-oauth-callback] Error:", error);
    return redirect("", "server_error");
  }
}
