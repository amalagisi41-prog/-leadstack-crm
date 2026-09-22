import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { googleBusinessRedirectUri } from "@/lib/business-profile/google-redirect";
import {
  loadCalendarSecrets,
  writeCalendarSecrets,
  writeGoogleWorkspaceSecrets,
} from "@/lib/comms/sub-account-secrets";
import {
  BUSINESS_MANAGE_SCOPE,
  CALENDAR_EVENTS_SCOPE,
  GMAIL_SEND_SCOPE,
  googleAccountClient,
} from "@/lib/google/account-connect";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

type UserInfo = { email?: string; name?: string; picture?: string };

/**
 * Finish the unified Google Profile connection: one token exchange, then fan
 * the grant out to every Google-backed connection the user actually approved
 * (Google's consent screen lets them untick individual scopes).
 *
 * Tokens only ever go to the server-only secrets subcollection; the
 * sub-account document gets the public half so the Connect screen can show
 * "Connected · name@gmail.com".
 */
export async function completeGoogleAccountConnection(
  request: NextRequest,
  subAccountId: string,
  code: string,
): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const back = (params: string) =>
    NextResponse.redirect(new URL(`/sa/${subAccountId}/connect?${params}`, origin));
  const fail = (reason: string) =>
    back(`google=error&google_error=${encodeURIComponent(reason)}`);

  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return fail("unauthorized");

  const client = googleAccountClient();
  if (!client) return fail("not_configured");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: googleBusinessRedirectUri(),
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text().catch(() => "");
      console.error("[google/account-callback] token exchange failed", tokenRes.status, detail.slice(0, 300));
      return fail("token_exchange_failed");
    }
    const tokens = (await tokenRes.json()) as TokenResponse;
    const granted = new Set((tokens.scope ?? "").split(/\s+/).filter(Boolean));

    const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) return fail("userinfo_failed");
    const info = (await infoRes.json()) as UserInfo;
    const email = info.email ?? "";
    const name = info.name ?? email;
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    const subRef = getAdminDb().doc(`subAccounts/${subAccountId}`);
    const current = (await subRef.get()).data() as
      | {
          googleWorkspaceConfig?: { senderEmail?: string } | null;
          calendarConfig?: { provider?: string } | null;
        }
      | undefined;
    // Never silently replace a different sender mailbox or an Outlook calendar.
    const existingSender = current?.googleWorkspaceConfig?.senderEmail;
    const canSetGmail =
      !existingSender || existingSender.toLowerCase() === email.toLowerCase();
    const existingCalendar = current?.calendarConfig?.provider;
    const canSetCalendar = !existingCalendar || existingCalendar === "google";

    const update: Record<string, unknown> = {
      googleAccountConfig: {
        status: "connected",
        email,
        name,
        picture: info.picture ?? null,
        scopes: Array.from(granted),
        gmail: granted.has(GMAIL_SEND_SCOPE),
        calendar: granted.has(CALENDAR_EVENTS_SCOPE),
        businessProfile: granted.has(BUSINESS_MANAGE_SCOPE),
        connectedAt: FieldValue.serverTimestamp(),
        connectedByUid: access.uid,
      },
    };

    if (granted.has(GMAIL_SEND_SCOPE) && canSetGmail) {
      // Same OAuth client the Gmail sender refreshes with (google-workspace.ts).
      await writeGoogleWorkspaceSecrets(subAccountId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt,
      });
      update.googleWorkspaceConfig = {
        status: "connected",
        senderEmail: email,
        senderName: name,
        connectedAt: new Date(),
        connectedByUid: access.uid,
      };
    }

    if (granted.has(CALENDAR_EVENTS_SCOPE) && canSetCalendar) {
      const existing = await loadCalendarSecrets(subAccountId, "google");
      const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
      if (refreshToken) {
        await writeCalendarSecrets(subAccountId, {
          provider: "google",
          accessToken: tokens.access_token,
          refreshToken,
          expiresAt,
        });
        update.calendarConfig = {
          provider: "google",
          status: "connected",
          email,
          displayName: info.name ?? null,
          connectedAt: new Date(),
          connectedByUid: access.uid,
        };
      }
    }

    await subRef.update(update);
    return back("google=connected");
  } catch (err) {
    console.error("[google/account-callback] error", err);
    return fail("server_error");
  }
}
