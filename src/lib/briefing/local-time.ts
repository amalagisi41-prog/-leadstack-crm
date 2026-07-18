/**
 * Pure local-time math for the Daily Briefing sweep — "what hour is it, and
 * what are today's UTC-ms boundaries, in this sub-account's timezone right
 * now." Split out from `send.ts` (the server-only orchestrator) so it can be
 * unit-tested directly, same shape as `workflows/time-trigger-dates.ts`.
 */

export interface LocalTimeInfo {
  /** 0-23, the current hour in the given timezone. */
  hour: number;
  /** "YYYY-MM-DD" in the given timezone — the dedup key for "already sent today." */
  dateKey: string;
  /** UTC ms of local midnight today. */
  dayStartMs: number;
  /** UTC ms of local midnight tomorrow (exclusive upper bound for "today"). */
  dayEndMs: number;
}

export function localTimeInfo(
  timezone: string | null | undefined,
  now: Date = new Date(),
): LocalTimeInfo {
  const tz = timezone || "UTC";
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    // Invalid timezone string — fall back to UTC rather than throwing, so a
    // bad config can't crash the sweep for every other sub-account.
    return localTimeInfo("UTC", now);
  }

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour") % 24;
  const minute = get("minute");
  const second = get("second");

  // Derive the timezone's current UTC offset by comparing the wall-clock
  // reading (treated as if it were UTC) against the real instant, then use
  // that offset to convert "local midnight" into a real UTC timestamp.
  const asUtcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = asUtcGuess - now.getTime();
  const dayStartMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { hour, dateKey, dayStartMs, dayEndMs };
}
