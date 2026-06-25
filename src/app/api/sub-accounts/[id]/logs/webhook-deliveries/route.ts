import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { listRecentEventsWithDeliveries } from "@/lib/firestore/webhook-events";

/**
 * Logs → Webhooks tab data source.
 *
 * GET — list recent emitted webhook events with their per-attempt delivery
 *       rows nested, newest first. Admin-only (deliveries carry response
 *       bodies + URLs; same bar as managing the subscriptions themselves).
 *
 * Optional `?limit=` (events, clamped to 50 in the helper). Mode filtering
 * happens client-side so live/test share one fetch.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const events = await listRecentEventsWithDeliveries(subAccountId, { limit });
    return NextResponse.json({ events });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `[logs/webhook-deliveries] list failed sa=${subAccountId}`,
      err,
    );
    // Admin-only debug surface — return the real cause so the operator can
    // see it in the toast without digging through server logs.
    return NextResponse.json(
      { error: `Couldn't load webhook logs: ${detail}`, detail },
      { status: 500 },
    );
  }
}
