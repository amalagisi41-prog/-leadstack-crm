import "server-only";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { fireWorkflowTrigger } from "@/lib/workflows/engine";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import type { ActivityType } from "@/types/contacts";
import type { WebhookEventType } from "@/types/webhooks";
import type { AutomationTriggerType } from "@/types";
import type { CalendarEvent } from "@/types/events";

/**
 * Side-effects fired off the back of a booking-event lifecycle change.
 * Keeps the route handlers (book / cancel / reschedule / mark-paid)
 * tight — they call into one helper per event, which handles the
 * timeline row + the automation trigger + (for create / payment) the
 * reminder schedule.
 *
 * Failure handling: every function swallows errors. The primary
 * lifecycle write has already committed by the time these run; a
 * timeline row failure can't be allowed to break the public booking
 * surface.
 */

type BookingLifecycleEvent =
  | "booking_page_booked"
  | "booking_payment_received"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "booking_no_show"
  | "booking_completed";

/**
 * Write an activity-timeline row for a booking lifecycle event.
 * Tenancy is inherited from the parent contact doc; createdBy =
 * "booking" so the operator can tell apart system-generated rows
 * from manual notes.
 */
export async function recordBookingActivity(
  event: Pick<CalendarEvent, "id" | "title" | "contactId" | "bookingPageSlug">,
  type: BookingLifecycleEvent,
  opts: {
    extra?: string | null;
    paymentAmount?: number;
    paymentCurrency?: string;
  } = {},
): Promise<void> {
  if (!event.contactId) return;
  try {
    const content = defaultContent(event.title || "Meeting", type, opts.extra);
    await getAdminDb()
      .collection("contacts")
      .doc(event.contactId)
      .collection("activities")
      .add({
        type: type satisfies ActivityType,
        content,
        createdBy: "booking",
        meta: {
          eventId: event.id,
          bookingPageSlug: event.bookingPageSlug ?? undefined,
          paymentAmount: opts.paymentAmount,
          paymentCurrency: opts.paymentCurrency,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn(`[booking/lifecycle] activity write failed for ${type}`, err);
  }
}

function defaultContent(
  title: string,
  type: BookingLifecycleEvent,
  extra: string | null | undefined,
): string {
  const suffix = extra ? ` — ${extra}` : "";
  switch (type) {
    case "booking_page_booked":
      return `Meeting booked: "${title}"${suffix}.`;
    case "booking_payment_received":
      return `Booking payment received for "${title}"${suffix}.`;
    case "booking_cancelled":
      return `Meeting cancelled: "${title}"${suffix}.`;
    case "booking_rescheduled":
      return `Meeting rescheduled: "${title}"${suffix}.`;
    case "booking_no_show":
      return `No-show on "${title}"${suffix}.`;
    case "booking_completed":
      return `Meeting completed: "${title}"${suffix}.`;
  }
}

/**
 * Dispatch a workflow trigger. v1 ships the dispatch plumbing but no
 * recipe type subscribes to booking events yet — mirrors the quote
 * triggers' v1 caveat. Safe to call from any path.
 */
export async function fireBookingTrigger(
  event: Pick<CalendarEvent, "agencyId" | "subAccountId" | "contactId">,
  trigger: Extract<AutomationTriggerType, `event_${string}`>,
): Promise<void> {
  if (!event.contactId) return;
  // Workflow Builder: only new bookings are a v1 trigger.
  if (trigger === "event_booked") {
    void fireWorkflowTrigger({
      agencyId: event.agencyId,
      subAccountId: event.subAccountId,
      type: "booking.created",
      contactId: event.contactId,
    });
  }
}

/** Booking lifecycle events that have a matching outbound webhook type. */
const BOOKING_WEBHOOK_MAP: Partial<
  Record<BookingLifecycleEvent, WebhookEventType>
> = {
  booking_page_booked: "booking.created",
  booking_cancelled: "booking.cancelled",
};

function tsToIsoOrNull(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().toISOString();
  if (typeof maybe.seconds === "number") {
    return new Date(maybe.seconds * 1000).toISOString();
  }
  return null;
}

/**
 * Emit the outbound webhook for a booking lifecycle event. No-ops for
 * events without a matching webhook type (reschedule / no-show / completed /
 * payment-received). Reads the event doc back so the payload reflects the
 * post-write state (e.g. cancelledAt on a cancel). Self-guarded — safe to
 * `void`. Bookings are always live (no test mode on this surface).
 */
export async function emitBookingWebhook(opts: {
  eventId: string;
  agencyId: string;
  subAccountId: string;
  type: BookingLifecycleEvent;
  cancelReason?: string | null;
}): Promise<void> {
  const webhookType = BOOKING_WEBHOOK_MAP[opts.type];
  if (!webhookType) return;
  try {
    const snap = await getAdminDb().doc(`events/${opts.eventId}`).get();
    const data = snap.exists ? snap.data()! : {};
    const cancelled = webhookType === "booking.cancelled";
    await emitWebhookEvent({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      mode: "live",
      type: webhookType,
      payload: {
        booking: {
          id: opts.eventId,
          object: "booking",
          slug: (data.bookingPageSlug as string | null) ?? null,
          contact_id: (data.contactId as string | null) ?? null,
          title: (data.title as string | null) ?? null,
          start_at: tsToIsoOrNull(data.startAt),
          end_at: tsToIsoOrNull(data.endAt),
          status: (data.status as string | null) ?? "scheduled",
          created_at: tsToIsoOrNull(data.createdAt),
          cancelled_at: cancelled
            ? (tsToIsoOrNull(data.cancelledAt) ?? new Date().toISOString())
            : null,
          cancel_reason: cancelled
            ? (opts.cancelReason ?? (data.cancelReason as string | null) ?? null)
            : null,
        },
      },
    });
  } catch (err) {
    console.warn(`[booking/lifecycle] webhook emit failed for ${opts.type}`, err);
  }
}

/**
 * Schedule the configured reminder callbacks for an event via QStash.
 * Each offset becomes a future POST against `/api/events/reminder/step`
 * that fires `bookingPage.reminderOffsetsMinutes` minutes before
 * `event.startAt`. Skipped past-offsets (the event is too close to
 * "now") so we don't immediately re-send. Best-effort — when QStash
 * isn't configured we log + skip, and the booking still succeeds.
 *
 * Idempotency: the deduplication id includes `event.id` + the offset
 * so re-calling for the same event collapses on QStash's side.
 */
export async function scheduleEventReminders(input: {
  eventId: string;
  startAt: Date;
  reminderOffsetsMinutes: number[];
  /** Raw HMAC token — passed in the QStash payload so the receiver can
   *  build the reschedule/cancel URL without re-minting (which would
   *  rotate the stored hash mid-flight). Firestore stores only the
   *  hash; the token's only durable home is the in-flight QStash
   *  payload (encrypted in transit / at rest at Upstash). */
  rawToken: string;
  /** Set true when status is `awaiting_payment` — defers scheduling
   *  until the operator marks paid. */
  pendingPayment: boolean;
  /**
   * Optional disambiguator suffix on the dedup id. Reschedules pass a
   * fresh nonce so the new callbacks aren't collapsed with the
   * already-published ones for the previous slot.
   */
  scheduleNonce?: string;
}): Promise<void> {
  if (input.pendingPayment) return;
  if (input.reminderOffsetsMinutes.length === 0) return;
  if (!qstashIsConfigured()) {
    console.warn(
      "[booking/lifecycle] QStash not configured — reminders won't fire for event " +
        input.eventId,
    );
    return;
  }
  const now = Date.now();
  for (const offsetMin of input.reminderOffsetsMinutes) {
    const fireAt = input.startAt.getTime() - offsetMin * 60_000;
    const delaySeconds = Math.floor((fireAt - now) / 1000);
    // Skip past-offsets (e.g. event is in 30 min and offset is T-1h).
    if (delaySeconds < 30) continue;
    const nonceSuffix = input.scheduleNonce ? `_${input.scheduleNonce}` : "";
    try {
      await publishCallback({
        pathname: "/api/events/reminder/step",
        body: {
          eventId: input.eventId,
          offsetMinutes: offsetMin,
          token: input.rawToken,
        },
        delaySeconds,
        deduplicationId: `evt_reminder_${input.eventId}_${offsetMin}${nonceSuffix}`,
      });
    } catch (err) {
      console.warn(
        `[booking/lifecycle] reminder schedule failed (offset ${offsetMin})`,
        err,
      );
    }
  }
}

/**
 * Schedule the auto-expire callback for an `awaiting_payment` event.
 * Fires `paymentHoldExpiresAt` and cancels the booking if it hasn't
 * been marked paid by then. Idempotency: dedup id by event id.
 */
export async function schedulePaymentAutoExpire(input: {
  eventId: string;
  expiresAt: Date;
}): Promise<void> {
  if (!qstashIsConfigured()) {
    console.warn(
      "[booking/lifecycle] QStash not configured — payment hold won't auto-expire for event " +
        input.eventId,
    );
    return;
  }
  const delaySeconds = Math.max(
    30,
    Math.floor((input.expiresAt.getTime() - Date.now()) / 1000),
  );
  try {
    await publishCallback({
      pathname: "/api/events/payment/expire-step",
      body: { eventId: input.eventId },
      delaySeconds,
      deduplicationId: `evt_pay_expire_${input.eventId}`,
    });
  } catch (err) {
    console.warn("[booking/lifecycle] auto-expire schedule failed", err);
  }
}

/**
 * Helper to convert a Firestore-typed timestamp to a JS Date defensively.
 * Used by callbacks (reminder, expire) that read events back from
 * Firestore via the Admin SDK.
 */
export function timestampToDate(
  ts: Timestamp | { toDate?: () => Date } | Date | null | undefined,
): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const maybe = ts as { toDate?: () => Date };
  if (typeof maybe.toDate === "function") return maybe.toDate();
  return null;
}
