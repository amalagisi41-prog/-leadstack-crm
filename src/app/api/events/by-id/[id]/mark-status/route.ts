import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  emailIsConfigured,
  sendEmail,
  tenantFrom,
} from "@/lib/comms/resend";
import {
  fireBookingTrigger,
  recordBookingActivity,
} from "@/lib/booking/lifecycle";
import { renderBookingCancelledEmail } from "@/lib/booking/email";
import { eventStatus } from "@/types/events";
import type { ActivityType } from "@/types/contacts";
import type { AutomationTriggerType } from "@/types";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent, EventStatus } from "@/types/events";
import type { Contact } from "@/types/contacts";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * Operator-side status flip. Covers:
 *   - "completed"  — meeting actually happened
 *   - "no_show"    — attendee didn't show
 *   - "cancelled"  — operator-initiated cancel (emails the visitor)
 *
 * `awaiting_payment` → use POST /api/events/by-id/[id]/mark-paid instead.
 * `scheduled` → "completed" / "no_show" / "cancelled" allowed.
 * Terminal states (cancelled, completed, no_show) reject further flips.
 *
 * Auth: active sub-account member.
 */

interface PatchBody {
  status?: EventStatus;
  /** Optional free-text cancel reason. */
  reason?: string;
}

const ALLOWED: EventStatus[] = ["completed", "no_show", "cancelled"];

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.status || !ALLOWED.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED.join(", ")}` },
      { status: 400 },
    );
  }
  const next = body.status;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 240) : "";

  const db = getAdminDb();
  const eventRef = db.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = eventSnap.data() as CalendarEvent;

  const access = await requireSubAccountMember(request, event.subAccountId);
  if (access instanceof NextResponse) return access;

  const current = eventStatus(event);
  if (current === next) {
    return NextResponse.json({ ok: true, status: next, noop: true });
  }
  if (
    current === "completed" ||
    current === "cancelled" ||
    current === "no_show"
  ) {
    return NextResponse.json(
      {
        error:
          "This event is already in a final state — operators can't flip past it.",
      },
      { status: 409 },
    );
  }
  if (current === "awaiting_payment" && next !== "cancelled") {
    return NextResponse.json(
      {
        error:
          "Mark as paid first if the visitor paid, or cancel to release the slot.",
      },
      { status: 409 },
    );
  }

  const patch: Record<string, unknown> = {
    status: next,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (next === "cancelled") {
    patch.cancelledAt = FieldValue.serverTimestamp();
    patch.cancelledByVisitor = false;
    patch.cancelReason = reason || "by_operator";
  }
  try {
    await eventRef.update(patch);
  } catch (err) {
    console.error("[events/mark-status] update failed", err);
    return NextResponse.json(
      { error: "Couldn't update event." },
      { status: 500 },
    );
  }

  const sideEffects = await runStatusSideEffects(event, next, reason);

  return NextResponse.json({
    ok: true,
    status: next,
    // Surface the actual outcome so the operator UI can render an
    // accurate toast — "Visitor notified by email" vs "Couldn't email
    // the visitor (<reason>)" — instead of always claiming success.
    ...(next === "cancelled"
      ? {
          notifyEmailSent: sideEffects.emailSent,
          notifyEmailSkipReason: sideEffects.emailSkipReason,
        }
      : {}),
  });
}

interface SideEffectResult {
  emailSent: boolean;
  /**
   * Why the cancellation email did NOT send. Surfaced back to the
   * operator UI so the toast can be honest. Values:
   *   - `not_cancelled`         status flip wasn't a cancellation
   *   - `no_contact`            event has no linked contact
   *   - `email_not_configured`  RESEND_API_KEY / EMAIL_FROM missing
   *   - `no_contact_email`      contact record has no email field
   *   - `contact_opted_out`     contact.emailOptedOut === true
   *   - `missing_records`       contact / sub-account doc not found
   *   - `bad_timestamps`        event's startAt/endAt unreadable
   *   - `send_failed`           Resend returned an error
   */
  emailSkipReason?:
    | "not_cancelled"
    | "no_contact"
    | "email_not_configured"
    | "no_contact_email"
    | "contact_opted_out"
    | "missing_records"
    | "bad_timestamps"
    | "send_failed";
}

async function runStatusSideEffects(
  event: CalendarEvent,
  next: EventStatus,
  reason: string,
): Promise<SideEffectResult> {
  if (!event.contactId) {
    return {
      emailSent: false,
      emailSkipReason: next === "cancelled" ? "no_contact" : "not_cancelled",
    };
  }

  // Map status → activity type + trigger.
  const activityType =
    next === "completed"
      ? "booking_completed"
      : next === "no_show"
        ? "booking_no_show"
        : "booking_cancelled";
  const triggerType: Extract<AutomationTriggerType, `event_${string}`> | null =
    next === "cancelled" ? "event_cancelled" : null;

  await recordBookingActivity(
    {
      id: event.id,
      title: event.title || "Meeting",
      contactId: event.contactId,
      bookingPageSlug: event.bookingPageSlug ?? null,
    },
    activityType satisfies ActivityType,
    { extra: reason || null },
  );
  if (triggerType) {
    await fireBookingTrigger(
      {
        agencyId: event.agencyId,
        subAccountId: event.subAccountId,
        contactId: event.contactId,
      },
      triggerType,
    );
  }

  // Operator-cancelled bookings notify the visitor via email.
  if (next !== "cancelled") return { emailSent: false, emailSkipReason: "not_cancelled" };
  if (!emailIsConfigured()) {
    console.warn(
      `[events/mark-status] email not configured — skipping cancel notify for event=${event.id}`,
    );
    return { emailSent: false, emailSkipReason: "email_not_configured" };
  }
  const db = getAdminDb();
  try {
    const [contactSnap, subSnap, pageSnap] = await Promise.all([
      db.collection("contacts").doc(event.contactId).get(),
      db.doc(`subAccounts/${event.subAccountId}`).get(),
      event.bookingPageSlug
        ? db
            .doc(
              `subAccounts/${event.subAccountId}/bookingPages/${event.bookingPageSlug}`,
            )
            .get()
        : Promise.resolve(null),
    ]);
    if (!contactSnap.exists || !subSnap.exists) {
      console.warn(
        `[events/mark-status] missing records: contact=${contactSnap.exists} sub=${subSnap.exists} event=${event.id}`,
      );
      return { emailSent: false, emailSkipReason: "missing_records" };
    }
    const contact = contactSnap.data() as Contact;
    const sub = subSnap.data() as SubAccountDoc;
    const page = (pageSnap?.data() ?? null) as BookingPage | null;
    if (!contact.email) {
      return { emailSent: false, emailSkipReason: "no_contact_email" };
    }
    if (contact.emailOptedOut) {
      return { emailSent: false, emailSkipReason: "contact_opted_out" };
    }
    const startAt = (
      event.startAt as { toDate?: () => Date } | null
    )?.toDate?.();
    const endAt = (
      event.endAt as { toDate?: () => Date } | null
    )?.toDate?.();
    if (!(startAt instanceof Date) || !(endAt instanceof Date)) {
      console.warn(
        `[events/mark-status] bad timestamps event=${event.id} start=${typeof startAt} end=${typeof endAt}`,
      );
      return { emailSent: false, emailSkipReason: "bad_timestamps" };
    }

    const rendered = renderBookingCancelledEmail(
      {
        recipientName: contact.name ?? "",
        businessName: sub.name ?? "Booking",
        businessLogoUrl: sub.logoUrl,
        page: {
          name: page?.name ?? event.title ?? "Meeting",
          durationMinutes:
            page?.durationMinutes ??
            Math.max(15, Math.round((endAt.getTime() - startAt.getTime()) / 60_000)),
          timezone: page?.timezone ?? "UTC",
          payment: page?.payment ?? null,
          confirmationMessage: page?.confirmationMessage ?? "",
        },
        startAt,
        endAt,
        publicEventUrl: "",
      },
      "by_operator",
    );
    try {
      await sendEmail({
        to: contact.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        replyTo: sub.replyToEmail ?? undefined,
        from: tenantFrom(sub),
      });
      return { emailSent: true };
    } catch (err) {
      console.warn(
        `[events/mark-status] cancel notify send failed event=${event.id} to=${contact.email}`,
        err,
      );
      return { emailSent: false, emailSkipReason: "send_failed" };
    }
  } catch (err) {
    console.warn(
      `[events/mark-status] side-effect read failed event=${event.id}`,
      err,
    );
    return { emailSent: false, emailSkipReason: "missing_records" };
  }
}
