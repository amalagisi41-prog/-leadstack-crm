import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { fetchReportsSummary } from "@/lib/reports/fetch-summary";
import type { ReportsRangeKey } from "@/lib/reports/summary";

const VALID_RANGES = new Set<string>(["7d", "30d", "90d", "all"]);

/**
 * GET /api/sub-accounts/[id]/reports/summary?range=30d
 *
 * The server-side equivalent of what the Reports page already computes
 * client-side off a live subscription — this route exists so a server-side
 * consumer (the performance-narrative skill; anyone scripting against the
 * public API later) has something to call. Admin-only, same as every other
 * reporting-adjacent route — a collaborator's territory-scoped view is a UI
 * concern for the live page, not this summary.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range") ?? "30d";
  if (!VALID_RANGES.has(rangeParam)) {
    return NextResponse.json(
      { error: "`range` must be one of 7d, 30d, 90d, all." },
      { status: 400 }
    );
  }

  const summary = await fetchReportsSummary(
    subAccountId,
    rangeParam as ReportsRangeKey
  );

  return NextResponse.json({ ok: true, summary });
}
