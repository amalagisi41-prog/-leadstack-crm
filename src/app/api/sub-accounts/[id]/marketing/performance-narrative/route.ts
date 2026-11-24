import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { fetchReportsSummary } from "@/lib/reports/fetch-summary";
import { buildPerformanceNarrative } from "@/lib/marketing/performance-narrative";
import { aiIsConfigured } from "@/lib/comms/ai/openrouter";
import type { ReportsRangeKey } from "@/lib/reports/summary";
import type { BusinessProfileContent } from "@/types/business-profile";

const VALID_RANGES = new Set<string>(["7d", "30d", "90d", "all"]);

/**
 * POST /api/sub-accounts/[id]/marketing/performance-narrative
 * Body: { range?: "7d" | "30d" | "90d" | "all" } — defaults to "30d".
 *
 * Reads the same KPI summary /reports/summary serves, then has the model
 * narrate it — see lib/marketing/performance-narrative.ts for the "ground it
 * strictly in the numbers given" discipline. Admin-only, same gate as every
 * other reporting/marketing route.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!aiIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "OPENROUTER_API_KEY is not set on this deployment. Set it to enable AI-written performance summaries.",
      },
      { status: 503 }
    );
  }

  let body: { range?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const rangeParam =
    typeof body.range === "string" && VALID_RANGES.has(body.range)
      ? body.range
      : "30d";

  const [summary, profileSnap] = await Promise.all([
    fetchReportsSummary(subAccountId, rangeParam as ReportsRangeKey),
    getAdminDb().doc(`subAccounts/${subAccountId}/businessProfile/main`).get(),
  ]);
  const businessName = (profileSnap.data() as BusinessProfileContent | undefined)
    ?.brokerage;

  try {
    const result = await buildPerformanceNarrative({ summary, businessName });
    return NextResponse.json({
      ok: true,
      summary,
      narrative: result.narrative,
      recommendations: result.recommendations,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not generate a performance summary.",
      },
      { status: 502 }
    );
  }
}
