import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  emailIsConfigured,
  sendEmail,
  tenantFrom,
} from "@/lib/comms/resend";
import {
  hashEventToken,
  verifyEventToken,
} from "@/lib/booking/event-token";
import {
  emitBookingWebhook,
  fireBookingTrigger,
  recordBookingActivity,
} from "@/lib/booking/lifecycle";
import { renderBookingCancelledEmail } from "@/lib/booking/email";
import { eventStatus } from "@/types/events";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent } from "@/types/events";
import type { Contact } from "@/types/contacts";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * Public cancel endpoint. The HMAC token IS the credential; we don't
 * need session auth. Transactionally guards against double-flip if the
 * visitor clicks twice fast.
 *
 * Side-effects (best-effort): visitor confirmation email, operator
 * notification email (if `escalationNotifyEmail` would have been the
 * channel, but v1 just emails the sub-account's primary `replyToEmail`),
 * activity row, automation trigger.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const verified = verifyEventToken(token);
  if (!verified) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const db = getAdminDb();
  const ref = db.collection("events").doc(verified.eventId);

  // Transactional read + flip so concurrent cancels collapse.
  let cancelledEvent: CalendarEvent | null = null;
  try {
    cancelledEvent = await db.runTransaction(async (txn) => {
      const eventSnap = await txn.get(ref);
      if (!eventSnap.exists) throw new TokenInvalid();
      const event = eventSnap.data() as CalendarEvent;
      if (event.publicTokenHash !== hashEventToken(token)) {
        throw new TokenInvalid();
      }
      const status = eventStatus(event);
      if (status === "cancelled") {
        // Idempotent — second cancel returns success.
        return event;
      }
      if (status === "completed" || status === "no_show") {
        throw new BadState("This meeting has already taken place.");
      }
      txn.update(ref, {
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledByVisitor: true,
        cancelReason: "by_visitor",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return event;
    });
  } catch (err) {
    if (err instanceof TokenInvalid) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    if (err instanceof BadState) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[events/cancel] txn failed", err);
    return NextResponse.json(
      { error: "Couldn't cancel. Try again." },
      { status: 500 },
    );
  }

  if (cancelledEvent) {
    await runSideEffects(cancelledEvent);
  }

  return NextResponse.json({ ok: true });
}

class TokenInvalid extends Error {}
class BadState extends Error {}

async function runSideEffects(event: CalendarEvent): Promise<void> {
  if (!event.contactId) return;
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
    if (contactSnap.exists && subSnap.exists && emailIsConfigured()) {
      const contact = contactSnap.data() as Contact;
      const sub = subSnap.data() as SubAccountDoc;
      const page = (pageSnap?.data() ?? null) as BookingPage | null;
      const startAt = (
        event.startAt as { toDate?: () => Date } | null
      )?.toDate?.();
      const endAt = (
        event.endAt as { toDate?: () => Date } | null
      )?.toDate?.();
      if (
        contact.email &&
        !contact.emailOptedOut &&
        startAt instanceof Date &&
        endAt instanceof Date
      ) {
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
          "by_visitor",
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
        } catch (err) {
          console.warn("[events/cancel] confirmation send failed", err);
        }
      }
    }
  } catch (err) {
    console.warn("[events/cancel] side-effect read failed", err);
  }

  await recordBookingActivity(
    {
      id: event.id,
      title: event.title || "Meeting",
      contactId: event.contactId,
      bookingPageSlug: event.bookingPageSlug ?? null,
    },
    "booking_cancelled",
    { extra: "by attendee" },
  );
  await fireBookingTrigger(
    {
      agencyId: event.agencyId,
      subAccountId: event.subAccountId,
      contactId: event.contactId,
    },
    "event_cancelled",
  );
  void emitBookingWebhook({
    eventId: event.id,
    agencyId: event.agencyId,
    subAccountId: event.subAccountId,
    type: "booking_cancelled",
    cancelReason: "by attendee",
  });
}
