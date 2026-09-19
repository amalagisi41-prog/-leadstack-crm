import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { signCalendarOAuthState } from "@/lib/calendar/oauth-state";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Outlook sign-in is not configured on this deployment." },
      { status: 503 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const redirectUri = appUrl.replace(/\/$/, "") + "/api/calendar/outlook-oauth-callback";
  const state = signCalendarOAuthState(id, "outlook");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: "openid profile email offline_access User.Read Calendars.ReadWrite",
    state,
  });

  return NextResponse.json({
    authUrl:
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" +
      params.toString(),
  });
}
