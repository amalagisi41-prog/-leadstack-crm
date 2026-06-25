/**
 * Multi-event ICS feed generator — the operator's "calendar subscription"
 * surface. Powers GET /api/sub-accounts/{id}/calendar.ics so external
 * calendar clients (Google, Apple, Outlook) can pull the sub-account's
 * bookings as a subscribed read-only calendar.
 *
 * Sibling of `ics.ts` which generates a single-event invite attachment.
 * Kept separate because:
 *   - The feed has METHOD:PUBLISH (informational), not REQUEST (invite)
 *   - No per-event ORGANIZER / ATTENDEE (the feed is the operator's own
 *     view, not an invite to send out)
 *   - STATUS varies per event (CONFIRMED vs CANCELLED) so external
 *     calendars can clean up cancelled bookings on the next poll
 *
 * Output is CRLF-terminated per RFC 5545.
 */

export interface FeedEventInput {
  /** Stable per-event UID. Use the Firestore event id. */
  uid: string;
  /** Start instant (UTC). */
  startAt: Date;
  /** End instant (UTC). */
  endAt: Date;
  /** SUMMARY — appears as the event title in the subscriber's calendar. */
  summary: string;
  /** Free-form DESCRIPTION body. */
  description?: string;
  /**
   * LOCATION value. For booking-page events we put the meeting URL here
   * so Google Calendar / Apple Calendar auto-detect it and render a
   * "join" affordance natively.
   */
  location?: string;
  /**
   * Event status. Cancelled events stay in the feed with STATUS:CANCELLED
   * so the subscriber's calendar removes them on the next poll instead of
   * keeping a phantom entry.
   */
  status: "CONFIRMED" | "CANCELLED" | "TENTATIVE";
  /** ISO timestamp of the last modification. */
  lastModified?: Date;
}

export interface FeedInput {
  /** Hostname used for the UID suffix and PRODID. From NEXT_PUBLIC_APP_URL. */
  domain: string;
  /** Display name surfaced in Google Calendar's "Other calendars" list. */
  calendarName: string;
  events: FeedEventInput[];
}

function formatIcsDate(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
  }
  return out.join("\r\n");
}

export function generateIcsFeed(input: FeedInput): string {
  const stampNow = formatIcsDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//LeadStack//Calendar Feed//${input.domain}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
    // Refresh interval hint — Google ignores it (polls on its own
    // schedule, typically 8-24h), but Apple Calendar respects it.
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const e of input.events) {
    const lastMod = formatIcsDate(e.lastModified ?? new Date());
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@${input.domain}`,
      `DTSTAMP:${stampNow}`,
      `DTSTART:${formatIcsDate(e.startAt)}`,
      `DTEND:${formatIcsDate(e.endAt)}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
      `STATUS:${e.status}`,
      `LAST-MODIFIED:${lastMod}`,
    );
    if (e.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    }
    if (e.location) {
      lines.push(`LOCATION:${escapeIcsText(e.location)}`);
    }
    // SEQUENCE bumps when the event is reissued; for feed purposes a
    // single 0 is fine because external clients compare DTSTAMP /
    // LAST-MODIFIED to detect changes.
    lines.push("SEQUENCE:0", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
