import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  buildReportsSummary,
  type ReportsRangeKey,
} from "@/lib/reports/summary";
import type { Deal } from "@/types/deals";
import type { Contact } from "@/types/contacts";
import type { SubAccountDoc } from "@/types/tenancy";

const VALID_RANGES = new Set<string>(["7d", "30d", "90d", "all"]);

/**
 * GET /api/sub-accounts/[id]/reports/summary?range=30d
 *
 * The server-side equivalent of what the Reports page already computes
 * client-side off a live subscription — this route exists so a server-side
 * consumer (the planned performance-narrative skill; anyone scripting
 * against the public API later) has something to call. Admin-only, same as
 * every other reporting-adjacent route — a collaborator's territory-scoped
 * view is a UI concern for the live page, not this summary.
 *
 * Excludes seeded sample data (`isSample === true`) on both contacts and
 * deals — narrating a brand-new workspace's demo data as real performance
 * would be a textbook false "you're doing great."
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
  const range = rangeParam as ReportsRangeKey;

  const db = getAdminDb();
  const [subSnap, dealsSnap, contactsSnap] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    db.collection("deals").where("subAccountId", "==", subAccountId).get(),
    db.collection("contacts").where("subAccountId", "==", subAccountId).get(),
  ]);

  const pipelineStages = (subSnap.data() as SubAccountDoc | undefined)
    ?.pipelineStages;

  const deals = dealsSnap.docs
    .map((d) => d.data() as Deal)
    .filter((d) => d.isSample !== true);
  const contacts = contactsSnap.docs
    .map((d) => d.data() as Contact)
    .filter((c) => c.isSample !== true);

  const summary = buildReportsSummary({
    deals,
    contacts,
    pipelineStages,
    range,
  });

  return NextResponse.json({ ok: true, summary });
}
