/**
 * THE one rule for counting records in a workspace that may hold the seeded
 * worked example (`isSample: true`, see lib/seed/sample-workspace.ts):
 *
 *   Sample records are EXCLUDED from every headline number — dashboard
 *   metrics, pipeline stat cards, reports, exports, empty-state decisions.
 *   They stay visible only in their own lists (People, Deals, search), under
 *   the sample banner / a "Sample" label.
 *
 * Before this existed each surface decided for itself: Reports filtered
 * samples out, while the dashboard, the Settings export and the pipeline stat
 * cards counted them, so one workspace reported 0, 3 and 5 deals at once and
 * announced five fictional contacts as "new leads". Every surface now goes
 * through these helpers so they cannot drift again.
 */

export interface MaybeSample {
  isSample?: boolean;
}

export function isSampleRecord(record: MaybeSample | null | undefined): boolean {
  return record?.isSample === true;
}

/** The records that count. */
export function realRecords<T extends MaybeSample>(records: readonly T[]): T[] {
  return records.filter((r) => !isSampleRecord(r));
}

export function sampleCount(records: readonly MaybeSample[]): number {
  return records.filter(isSampleRecord).length;
}

interface CountableDeal extends MaybeSample {
  stageId: string;
}
interface CountableContact extends MaybeSample {
  createdAt?: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value) || 0;
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
}

export interface WorkspaceHeadlineCounts {
  contacts: number;
  deals: number;
  openDeals: number;
  /** Real contacts created in the last 24 hours. */
  newLeads: number;
  sampleContacts: number;
  sampleDeals: number;
  /** True when there is nothing real to count — sample data alone is empty. */
  empty: boolean;
}

export function headlineCounts(
  contacts: readonly CountableContact[],
  deals: readonly CountableDeal[],
  nowMs: number = Date.now(),
): WorkspaceHeadlineCounts {
  const c = realRecords(contacts);
  const d = realRecords(deals);
  const cutoff = nowMs - DAY_MS;
  return {
    contacts: c.length,
    deals: d.length,
    openDeals: d.filter((x) => x.stageId !== "won" && x.stageId !== "lost").length,
    newLeads: c.filter((x) => toMs(x.createdAt) >= cutoff).length,
    sampleContacts: sampleCount(contacts),
    sampleDeals: sampleCount(deals),
    empty: c.length === 0 && d.length === 0,
  };
}
