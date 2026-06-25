import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { listRequestLogs } from "@/lib/api/logs";

/**
 * Logs → API tab data source.
 *
 * GET — list recent public-API request logs for this sub-account, newest
 *       first. Admin-only (these excerpts can include request/response
 *       bodies; collaborators don't get them — same bar as API keys).
 *
 * Optional `?limit=` (clamped to 200 in the helper). Mode filtering is done
 * client-side in the viewer so live/test tabs share one fetch.
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
    const logs = await listRequestLogs(subAccountId, { limit });
    return NextResponse.json({ logs });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `[logs/api-requests] list failed sa=${subAccountId}`,
      err,
    );
    // Admin-only debug surface — return the real cause so the operator can
    // see it in the toast without digging through server logs.
    return NextResponse.json(
      { error: `Couldn't load API logs: ${detail}`, detail },
      { status: 500 },
    );
  }
}
