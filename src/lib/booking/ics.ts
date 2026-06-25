/**
 * ICS (RFC 5545) calendar invite generator. Pure — no IO, no library.
 * Attached to confirmation emails so attendees can one-click add the
 * meeting to their own calendar (Apple, Google, Outlook all read .ics).
 *
 * Kept intentionally minimal:
 *  - VCALENDAR + VEVENT only, METHOD:REQUEST (so calendar apps treat it
 *    as an invite rather than a noop).
 *  - UID stable across reschedules (event id) so updates aren't
 *    duplicated — we re-emit with a higher SEQUENCE on reschedule.
 *  - Timezone-safe: all DTSTART / DTEND emit in UTC (Z suffix).
 *  - No RRULE — v1 doesn't support recurring meetings.
 */

export interface IcsInput {
  /** Stable per-event UID. Use the Firestore event id. */
  uid: string;
  /** Hostname used for the UID suffix and PRODID. From NEXT_PUBLIC_APP_URL. */
  domain: string;
  /** RFC 3339 / ISO timestamp for the start (must be in UTC). */
  startAt: Date;
  /** End instant (UTC). */
  endAt: Date;
  /** "Confirmed", "Cancelled" (RFC keyword). Defaults to CONFIRMED. */
  status?: "CONFIRMED" | "CANCELLED" | "TENTATIVE";
  /** Calendar method. v1 uses REQUEST for invites, CANCEL on cancel. */
  method?: "REQUEST" | "CANCEL";
  summary: string;
  description?: string;
  /** Free text — phone, video URL, or "We'll send the link separately." */
  location?: string;
  /** Sequence number — increment on each update (reschedule). */
  sequence?: number;
  /** ISO timestamp of the last modification. Defaults to now. */
  lastModified?: Date;
  /** Organizer email (operator / sub-account). Optional but improves
   *  display in some clients. */
  organizerEmail?: string;
  organizerName?: string;
  /** Attendee email. Optional. */
  attendeeEmail?: string;
  attendeeName?: string;
}

/** Format a Date as a UTC ICS DATE-TIME ("19980119T070000Z"). */
function formatIcsDate(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Escape an ICS TEXT field per RFC 5545 §3.3.11:
 *   - "\\" → "\\\\"
 *   - ";"  → "\\;"
 *   - ","  → "\\,"
 *   - newline → "\\n"
 */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Soft-fold a long line to 75 octets per RFC 5545 §3.1. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
  }
  return out.join("\r\n");
}

export function generateIcs(input: IcsInput): string {
  const status = input.status ?? "CONFIRMED";
  const method = input.method ?? "REQUEST";
  const sequence = input.sequence ?? 0;
  const stampNow = formatIcsDate(input.lastModified ?? new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//LeadStack//Booking//${input.domain}//EN`,
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}@${input.domain}`,
    `DTSTAMP:${stampNow}`,
    `DTSTART:${formatIcsDate(input.startAt)}`,
    `DTEND:${formatIcsDate(input.endAt)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    `STATUS:${status}`,
    `SEQUENCE:${sequence}`,
    `LAST-MODIFIED:${stampNow}`,
  ];
  if (input.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  }
  if (input.location) {
    lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  }
  if (input.organizerEmail) {
    const cn = input.organizerName
      ? `;CN=${escapeIcsText(input.organizerName)}`
      : "";
    lines.push(`ORGANIZER${cn}:mailto:${input.organizerEmail}`);
  }
  if (input.attendeeEmail) {
    const cn = input.attendeeName
      ? `;CN=${escapeIcsText(input.attendeeName)}`
      : "";
    lines.push(
      `ATTENDEE${cn};RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${input.attendeeEmail}`,
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  // CRLF line endings — RFC 5545 §3.1 requires it for ICS files.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
