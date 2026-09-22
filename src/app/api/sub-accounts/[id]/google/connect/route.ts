import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  buildGoogleAccountAuthUrl,
  googleAccountClient,
} from "@/lib/google/account-connect";

/**
 * Start the single "Google Profile" connection (sign-in profile, Gmail,
 * Calendar, Business Profile). GET so the Connect card can be a plain link;
 * it only ever redirects to Google's consent screen.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const back = (error: string) =>
    NextResponse.redirect(
      new URL(
        `/sa/${subAccountId}/connect?google=error&google_error=${encodeURIComponent(error)}`,
        request.nextUrl.origin,
      ),
    );

  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) {
    return access.status === 401
      ? NextResponse.redirect(new URL("/login", request.nextUrl.origin))
      : back("admin_only");
  }

  const client = googleAccountClient();
  if (!client) return back("not_configured");

  return NextResponse.redirect(
    buildGoogleAccountAuthUrl(subAccountId, client.clientId),
  );
}
