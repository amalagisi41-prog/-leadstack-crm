import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  buildCalendarFeedUrl,
  buildHostCalendarFeedUrl,
} from "@/lib/booking/calendar-feed-token";

/**
 * Returns the caller's HMAC-signed calendar feed URLs for the sub-account.
 * Auth: any active member (admins + collaborators).
 *
 *   url     — all bookings in this sub-account (shared team calendar).
 *   hostUrl — only the bookings assigned to the CALLER. The uid is taken
 *             from the authenticated session (`access.uid`), never client
 *             input, so a member can only ever mint their own personal feed.
 *
 * Tokens are server-derived from AUTOMATIONS_TOKEN_SECRET so the client
 * can't construct the URLs on its own. This endpoint is the bridge.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    const url = buildCalendarFeedUrl(subAccountId);
    const hostUrl = buildHostCalendarFeedUrl(subAccountId, access.uid);
    return NextResponse.json({ url, hostUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      {
        error:
          "Couldn't mint a calendar feed URL. Check that AUTOMATIONS_TOKEN_SECRET is configured on this deployment.",
        detail: message,
      },
      { status: 500 },
    );
  }
}
