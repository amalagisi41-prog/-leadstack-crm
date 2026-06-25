import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { Resend } from "resend";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  emailIsConfigured,
  sendEmail,
  tenantFrom,
} from "@/lib/comms/resend";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  buildEventPublicUrl,
  issueEventToken,
} from "@/lib/booking/event-token";
import { generateIcs } from "@/lib/booking/ics";
import {
  fireBookingTrigger,
  recordBookingActivity,
  scheduleEventReminders,
} from "@/lib/booking/lifecycle";
import { renderBookingConfirmationEmail } from "@/lib/booking/email";
import { eventStatus } from "@/types/events";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent } from "@/types/events";
import type { Contact } from "@/types/contacts";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * Operator-side "mark as paid" for a booking that's holding the slot
 * in `awaiting_payment`. Flips status to `scheduled`, rotates the
 * public token (so the visitor's payment-pending email's link still
 * works — see note below), schedules the reminder pipeline, sends a
 * fresh confirmation email + ICS, fires `event_paid`.
 *
 * Token rotation rationale: the booking email's "manage your booking"
 * link was rendered against the original token. We rotate here so an
 * attacker who scraped that link can't reuse it post-payment to
 * impersonate the visitor. The visitor's confirmation email carries
 * the fresh token.
 *
 * Auth: any active sub-account member (admins + collaborators). Same
 * scope as the contact-profile Email send — operators triage payments
 * across the team, not just admins.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await ctx.params;

  // Load the event up front so we can identify the sub-account for auth.
  const db = getAdminDb();
  const eventRef = db.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = eventSnap.data() as CalendarEvent;

  const access = await requireSubAccountMember(request, event.subAccountId);
  if (access instanceof NextResponse) return access;

  if (eventStatus(event) !== "awaiting_payment") {
    return NextResponse.json(
      {
        error: "Only events awaiting payment can be marked paid.",
        status: eventStatus(event),
      },
      { status: 409 },
    );
  }

  // Mint a fresh token + flip status. Single update, no need for a txn
  // here — the awaiting_payment guard above plus optimistic conflict on
  // the new hash is sufficient.
  const { token: newToken, hash: newHash } = issueEventToken(eventId);
  try {
    await eventRef.update({
      status: "scheduled",
      paidAt: FieldValue.serverTimestamp(),
      paidByUid: access.uid,
      publicTokenHash: newHash,
      paymentHoldExpiresAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[events/mark-paid] update failed", err);
    return NextResponse.json(
      { error: "Couldn't mark as paid." },
      { status: 500 },
    );
  }

  // Side effects — best-effort.
  const updatedEvent: CalendarEvent = {
    ...event,
    status: "scheduled",
    publicTokenHash: newHash,
  };
  await runMarkPaidSideEffects({ event: updatedEvent, rawToken: newToken });

  return NextResponse.json({
    ok: true,
    status: "scheduled",
    publicEventUrl: buildEventPublicUrl(newToken),
  });
}

async function runMarkPaidSideEffects(args: {
  event: CalendarEvent;
  rawToken: string;
}): Promise<void> {
  const { event, rawToken } = args;
  const db = getAdminDb();
  const startAt = (
    event.startAt as { toDate?: () => Date } | null
  )?.toDate?.();
  const endAt = (
    event.endAt as { toDate?: () => Date } | null
  )?.toDate?.();
  if (!(startAt instanceof Date) || !(endAt instanceof Date)) return;

  if (!event.contactId) return;
  let page: BookingPage | null = null;
  let sub: SubAccountDoc | null = null;
  let contact: Contact | null = null;
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
    contact = (contactSnap.exists ? contactSnap.data() : null) as Contact | null;
    sub = (subSnap.exists ? subSnap.data() : null) as SubAccountDoc | null;
    page = (pageSnap?.data() ?? null) as BookingPage | null;
  } catch (err) {
    console.warn("[events/mark-paid] tenancy read failed", err);
  }

  // Reminder pipeline + automation activity/trigger run regardless of
  // email send success.
  if (page?.remindersEnabled) {
    await scheduleEventReminders({
      eventId: event.id,
      startAt,
      reminderOffsetsMinutes: page.reminderOffsetsMinutes,
      rawToken,
      pendingPayment: false,
      scheduleNonce: "paid",
    });
  }

  await recordBookingActivity(
    {
      id: event.id,
      title: event.title || "Meeting",
      contactId: event.contactId,
      bookingPageSlug: event.bookingPageSlug ?? null,
    },
    "booking_payment_received",
    {
      paymentAmount: event.paymentAmount ?? undefined,
      paymentCurrency: event.paymentCurrency ?? undefined,
    },
  );
  await fireBookingTrigger(
    {
      agencyId: event.agencyId,
      subAccountId: event.subAccountId,
      contactId: event.contactId,
    },
    "event_paid",
  );

  if (!contact || !sub || !emailIsConfigured()) return;
  if (!contact.email || contact.emailOptedOut) return;

  const publicEventUrl = buildEventPublicUrl(rawToken);
  const rendered = renderBookingConfirmationEmail({
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
    publicEventUrl,
  });
  const appHost =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "")
      ?.replace(/\/.*$/, "")
      ?.toLowerCase() ?? "leadstack.dev";
  const ics = generateIcs({
    uid: event.id,
    domain: appHost,
    startAt,
    endAt,
    summary: event.title || page?.name || "Meeting",
    description: page?.confirmationMessage ?? "",
    location: event.location || "",
    method: "REQUEST",
    status: "CONFIRMED",
    sequence: 1,
    attendeeEmail: contact.email,
    attendeeName: contact.name ?? undefined,
    organizerEmail: sub.replyToEmail ?? undefined,
    organizerName: sub.name ?? undefined,
  });

  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY missing");
    const client = new Resend(key);
    const from = tenantFrom(sub) ?? process.env.EMAIL_FROM;
    if (!from) throw new Error("EMAIL_FROM missing");
    await client.emails.send({
      from,
      to: contact.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      replyTo: sub.replyToEmail ?? undefined,
      attachments: [
        {
          filename: "invite.ics",
          content: Buffer.from(ics, "utf-8").toString("base64"),
        },
      ],
    });
  } catch (err) {
    // Fall back to the standard wrapper without ICS so the visitor at
    // least gets the text confirmation.
    console.warn("[events/mark-paid] resend-with-ics failed, retrying without", err);
    try {
      await sendEmail({
        to: contact.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        replyTo: sub.replyToEmail ?? undefined,
        from: tenantFrom(sub),
      });
    } catch (err2) {
      console.warn("[events/mark-paid] confirmation send failed", err2);
    }
  }
}
