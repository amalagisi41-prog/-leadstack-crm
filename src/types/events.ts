import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Lifecycle of a calendar event. Defaults to `"scheduled"` for legacy
 * events written before this field existed — read via `eventStatus()`
 * which handles the missing-field case so call sites stay clean.
 *
 *   - "scheduled"        — normal, will fire reminders.
 *   - "awaiting_payment" — booking-page hold; PayPal.me deposit gate. Slot is
 *                          busy for availability but no reminders fire.
 *   - "completed"        — operator marked the meeting as done.
 *   - "cancelled"        — operator or visitor cancelled; slot is free.
 *   - "no_show"          — meeting time passed, attendee didn't appear.
 */
export type EventStatus =
  | "scheduled"
  | "awaiting_payment"
  | "completed"
  | "cancelled"
  | "no_show";

/**
 * Origin of an event. Defaults to `"manual"` for legacy events — read
 * via `eventSource()`. Booking-page-created events also fire the
 * `event_booked` automation trigger; manual events do not.
 */
export type EventSource = "manual" | "booking_page";

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: Timestamp | FieldValue | null;
  endAt: Timestamp | FieldValue | null;
  contactId: string | null;
  location: string;
  notes: string;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  /**
   * Denormalized territory tag, inherited from the linked contact at
   * creation. `null` = standalone event (admin-only triage when scoping
   * is on). Ignored unless `territoryScopingEnabled` is true.
   */
  territoryId?: string | null;
  /**
   * Lifecycle state. Undefined on events created before this field
   * shipped — readers MUST use `eventStatus()` so the default
   * `"scheduled"` is applied consistently.
   */
  status?: EventStatus;
  /**
   * Where the event came from. Undefined on legacy events — readers
   * MUST use `eventSource()` so the default `"manual"` is applied.
   */
  source?: EventSource;
  /**
   * Slug of the booking page that produced this event. Populated only
   * when `source === "booking_page"`. Powers the per-page bookings list
   * and the "view in booking page" deep-link.
   */
  bookingPageSlug?: string | null;
  /**
   * Snapshot of the booking page's `meetingUrl` at booking time. Stays
   * even if the page config later changes its URL. Surfaced in the
   * confirmation + reminder emails and the visitor's /e/[token] page.
   * `null` = no video link (in-person / "we'll send the link separately").
   */
  meetingUrl?: string | null;
  /**
   * SHA-256 hash of the most recent HMAC-signed public token issued for
   * this event. Powers the public /e/[token] view (reschedule / cancel).
   * Mirrors the quotes pattern — raw token never persisted; rotated on
   * every reschedule so old links invalidate cleanly.
   */
  publicTokenHash?: string | null;
  /** True when this event was booked via a page that required payment. */
  paymentRequired?: boolean;
  paymentAmount?: number | null;
  paymentCurrency?: string | null;
  /** PayPal.me URL minted at booking time (stateless URL — no API call). */
  paymentLinkUrl?: string | null;
  /** Set when the operator flips `awaiting_payment` → `scheduled`. */
  paidAt?: Timestamp | FieldValue | null;
  paidByUid?: string | null;
  /** Auto-expire deadline for unpaid holds. Used to schedule the QStash callback. */
  paymentHoldExpiresAt?: Timestamp | FieldValue | null;
  /**
   * Host this booking is assigned to, when the booking page runs in team
   * mode (round-robin). Null on legacy / single-schedule / manual events.
   */
  assignedToUid?: string | null;
  /**
   * Denormalized display name of the assigned host (snapshot at book time)
   * so the internal calendar + ICS feed render the owner without a member
   * lookup. Null when unassigned.
   */
  assignedToName?: string | null;
  /** Set when transitioning to `cancelled`. */
  cancelledAt?: Timestamp | FieldValue | null;
  /** True when the visitor cancelled via /e/[token]; false/undefined when the operator did. */
  cancelledByVisitor?: boolean | null;
  /** Free text or known sentinels: "rescheduled" | "payment_expired" | "operator". */
  cancelReason?: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export type EventFormData = {
  title: string;
  startAt: Date;
  endAt: Date;
  contactId: string | null;
  location: string;
  notes: string;
  /**
   * Video-call URL (Zoom / Google Meet / Whereby / etc). Snapshotted onto
   * booking-page events at book time and editable per-event from the
   * calendar dialog. `null` = no link / in-person.
   */
  meetingUrl?: string | null;
};

/**
 * Read an event's lifecycle status with the legacy default applied.
 * Use this at every status read site so events written before the
 * `status` field shipped continue to behave as if they were `scheduled`.
 */
export function eventStatus(
  e: Pick<CalendarEvent, "status"> | { status?: EventStatus },
): EventStatus {
  return e.status ?? "scheduled";
}

/**
 * Read an event's origin with the legacy default applied. Use this at
 * every source-branch site (e.g. "fire `event_booked` only when source
 * is `booking_page`") so legacy events behave as if they were manual.
 */
export function eventSource(
  e: Pick<CalendarEvent, "source"> | { source?: EventSource },
): EventSource {
  return e.source ?? "manual";
}

/**
 * Does this event status occupy a slot for availability purposes?
 * `scheduled` and `awaiting_payment` are busy; the terminal states
 * (cancelled / completed / no_show) free the slot. Centralised so
 * the availability calculator + UI badges stay in lockstep.
 */
export function eventOccupiesSlot(status: EventStatus): boolean {
  return status === "scheduled" || status === "awaiting_payment";
}
