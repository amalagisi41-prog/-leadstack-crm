/**
 * Pure date math for the Smart Workflows time-based triggers
 * (`contact.birthday`, `contact.home_anniversary`, `contact.stale`). No I/O —
 * kept separate from `time-triggers.ts` (the server-only sweep) so this logic
 * can be unit-tested directly.
 */

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** "Today" broken into calendar parts, evaluated in the given IANA timezone.
 *  Falls back to UTC for an empty/invalid timezone string. */
export function todayPartsInTimezone(
  timezone: string | null | undefined,
  now: Date = new Date(),
): DateParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Extracts "MM-DD" from a stored "YYYY-MM-DD" contact date field. Returns
 *  null for anything that doesn't parse (missing, malformed, legacy data). */
export function monthDayOf(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

/** True when `dateStr`'s month/day matches "today" in the given timezone. */
export function matchesTodayMonthDay(
  dateStr: string | null | undefined,
  timezone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const md = monthDayOf(dateStr);
  if (!md) return false;
  const { month, day } = todayPartsInTimezone(timezone, now);
  const todayMd = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return md === todayMd;
}

/** Whole days between two millisecond timestamps (floor — a partial day
 *  doesn't count as "N days since"). */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / 86_400_000);
}

/** Calendar year of a millisecond timestamp, in the given timezone. */
export function yearInTimezone(
  ms: number,
  timezone: string | null | undefined,
): number {
  return todayPartsInTimezone(timezone, new Date(ms)).year;
}
