import { toDate } from "@/lib/format";
import {
  resolvePipelineStages,
  type Deal,
  type PipelineStageOverride,
} from "@/types/deals";
import type { Contact } from "@/types/contacts";

/**
 * Server-side twin of the Reports page's own KPI math
 * (src/app/(dashboard)/sa/[subAccountId]/reports/page.tsx).
 *
 * The Reports page computes every number in a client "use client" component,
 * straight off a live Firestore subscription — there was no server-side
 * equivalent before this file, so a would-be AI narrative skill had nothing
 * to call. This is the exact same formulas, factored out so both the new
 * `/reports/summary` route and the Reports page itself derive from one
 * definition and can never quietly disagree. (The page isn't migrated to
 * call this yet — that's a separate, deliberately untouched change; this
 * file is additive.)
 */

export type ReportsRangeKey = "7d" | "30d" | "90d" | "all";

export const REPORTS_RANGE_DAYS: Record<ReportsRangeKey, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

export interface ReportsSummary {
  range: ReportsRangeKey;
  rangeDays: number | null;
  currency: string;
  kpis: {
    newLeads: number;
    wonDeals: number;
    lostDeals: number;
    openDeals: number;
    wonValue: number;
    openValue: number;
    avgDealValue: number;
    winRatePct: number;
  };
  /** Current deals by stage — a "right now" snapshot, not range-filtered (matches the page). */
  funnel: { stageId: string; label: string; count: number; value: number }[];
  wonRevenueTimeline: { date: string; label: string; value: number }[];
  newLeadsTimeline: { date: string; label: string; value: number }[];
  leadsBySource: { source: string; count: number }[];
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bucketDaily(days: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({
      key: dayKey(d),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }
  return out;
}

/**
 * Pure — no Firestore access. Callers fetch `deals`/`contacts` themselves
 * (excluding sample/seeded rows; see `isSample` on both types) so this stays
 * testable without a database and reusable from both the summary route and,
 * later, the performance-narrative skill.
 */
export function buildReportsSummary(args: {
  deals: readonly Deal[];
  contacts: readonly Contact[];
  pipelineStages?: PipelineStageOverride[] | null;
  range: ReportsRangeKey;
}): ReportsSummary {
  const { deals, contacts, range } = args;
  const stages = resolvePipelineStages(args.pipelineStages ?? undefined);
  const rangeDays = REPORTS_RANGE_DAYS[range];
  const rangeCutoff = rangeDays ? Date.now() - rangeDays * 24 * 60 * 60 * 1000 : 0;
  const currency = deals[0]?.currency ?? "USD";

  const contactsIn = contacts.filter((c) => {
    if (!rangeDays) return true;
    const d = toDate(c.createdAt);
    return !!d && d.getTime() >= rangeCutoff;
  });
  const dealsIn = deals.filter((d) => {
    if (!rangeDays) return true;
    const date = toDate(d.createdAt);
    return !!date && date.getTime() >= rangeCutoff;
  });

  const openDealsArr = dealsIn.filter(
    (d) => d.stageId !== "won" && d.stageId !== "lost"
  );
  const wonDealsArr = dealsIn.filter((d) => d.stageId === "won");
  const lostDealsArr = dealsIn.filter((d) => d.stageId === "lost");
  const openValue = openDealsArr.reduce((s, d) => s + (d.value || 0), 0);
  const wonValue = wonDealsArr.reduce((s, d) => s + (d.value || 0), 0);
  const avgDealValue = wonDealsArr.length > 0 ? wonValue / wonDealsArr.length : 0;
  const winRatePct =
    wonDealsArr.length + lostDealsArr.length > 0
      ? Math.round(
          (wonDealsArr.length / (wonDealsArr.length + lostDealsArr.length)) * 100
        )
      : 0;

  // Funnel is a "right now" view across ALL deals, not range-filtered —
  // matches the page's own comment on why.
  const counts = new Map<string, number>();
  const values = new Map<string, number>();
  for (const s of stages) {
    counts.set(s.id, 0);
    values.set(s.id, 0);
  }
  for (const d of deals) {
    counts.set(d.stageId, (counts.get(d.stageId) ?? 0) + 1);
    values.set(d.stageId, (values.get(d.stageId) ?? 0) + (d.value || 0));
  }
  const funnel = stages.map((s) => ({
    stageId: s.id,
    label: s.label,
    count: counts.get(s.id) ?? 0,
    value: values.get(s.id) ?? 0,
  }));

  const buckets = bucketDaily(rangeDays ?? 30);

  const wonByDay = new Map(buckets.map((b) => [b.key, 0]));
  for (const d of wonDealsArr) {
    const date = toDate(d.stageChangedAt) ?? toDate(d.createdAt);
    if (!date) continue;
    const key = dayKey(date);
    if (wonByDay.has(key)) wonByDay.set(key, (wonByDay.get(key) ?? 0) + (d.value || 0));
  }
  const wonRevenueTimeline = buckets.map((b) => ({
    date: b.key,
    label: b.label,
    value: wonByDay.get(b.key) ?? 0,
  }));

  const leadsByDay = new Map(buckets.map((b) => [b.key, 0]));
  for (const c of contactsIn) {
    const date = toDate(c.createdAt);
    if (!date) continue;
    const key = dayKey(date);
    if (leadsByDay.has(key)) leadsByDay.set(key, (leadsByDay.get(key) ?? 0) + 1);
  }
  const newLeadsTimeline = buckets.map((b) => ({
    date: b.key,
    label: b.label,
    value: leadsByDay.get(b.key) ?? 0,
  }));

  const sourceMap = new Map<string, number>();
  for (const c of contactsIn) {
    const key = c.source || "other";
    sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1);
  }
  const leadsBySource = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source: source || "unspecified", count }))
    .sort((a, b) => b.count - a.count);

  return {
    range,
    rangeDays,
    currency,
    kpis: {
      newLeads: contactsIn.length,
      wonDeals: wonDealsArr.length,
      lostDeals: lostDealsArr.length,
      openDeals: openDealsArr.length,
      wonValue,
      openValue,
      avgDealValue,
      winRatePct,
    },
    funnel,
    wonRevenueTimeline,
    newLeadsTimeline,
    leadsBySource,
  };
}
