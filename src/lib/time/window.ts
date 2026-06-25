/**
 * Shared timezone-aware "calling/send window" math. Extracted from the
 * automations executor so the outbound-voice compliance gate and the
 * automation step scheduler share ONE implementation.
 *
 * Both features ask the same question: "given a daily window
 * [startHour, endHour) in some IANA timezone, how many seconds until
 * we're allowed to act?" — 0 means we're inside the window now.
 */

export interface DailyWindow {
  /** Local hour the window opens (0-23). */
  startHour: number;
  /** Local hour the window closes (exclusive, 1-24). */
  endHour: number;
  /** IANA timezone, e.g. "Australia/Sydney". */
  timezone: string;
}

/**
 * Returns 0 if we're inside the window (or the window is null / invalid)
 * and a positive number of seconds to defer until the next window start
 * otherwise.
 *
 * Approximation: uses Intl.DateTimeFormat to read the wall-clock hour /
 * minute / second in the configured timezone, then computes the distance
 * to the start of today's window (or tomorrow's if we've passed
 * end-of-window today). Correct in normal time; DST transitions may shift
 * the actual moment by an hour, which we accept for v1.
 */
export function computeWindowDeferralSeconds(
  window: DailyWindow | null | undefined,
): number {
  if (!window) return 0;
  const { startHour, endHour, timezone } = window;
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(endHour) ||
    startHour >= endHour ||
    !timezone
  ) {
    return 0;
  }

  let h = 0;
  let m = 0;
  let s = 0;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const get = (t: string) =>
      parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
    h = get("hour") % 24; // some Intl impls return 24 instead of 0 at midnight
    m = get("minute");
    s = get("second");
  } catch (err) {
    console.warn(
      `[time/window] invalid timezone "${timezone}" — treating as inside window`,
      err,
    );
    return 0;
  }

  const currentSecsOfDay = h * 3600 + m * 60 + s;
  const startSecs = startHour * 3600;
  const endSecs = endHour * 3600;

  if (currentSecsOfDay >= startSecs && currentSecsOfDay < endSecs) {
    return 0; // inside window
  }
  if (currentSecsOfDay < startSecs) {
    return startSecs - currentSecsOfDay; // later today
  }
  // After end-of-window: tomorrow's start. (Naive on DST boundaries.)
  return 24 * 3600 - currentSecsOfDay + startSecs;
}
