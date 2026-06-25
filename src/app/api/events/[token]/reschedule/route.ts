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
import {
  computeAvailability,
  isSlotAvailable,
  type BusyEvent,
  type SlotCandidate,
} from "@/lib/booking/availability";
import {
  buildEventPublicUrl,
  hashEventToken,
  issueEventToken,
  verifyEventToken,
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
 * Public reschedule endpoint. The HMAC token IS the credential. On
 * success: rotates the token (any previously-mailed link invalidates),
 * updates `startAt` + `endAt` in-place (preserves event id, automations,
 * activity history), re-publishes reminder callbacks for the new
 * schedule, and sends a fresh confirmation email + ICS.
 *
 * Important constraints:
 *   - Status must currently occupy a slot (scheduled / awaiting_payment).
 *     Cancelled / past meetings can't be rescheduled — visitor must
 *     re-book.
 *   - Payment-pending events keep the payment requirement on the new
 *     slot (operator still has to mark paid). The hold-expiry deadline
 *     is NOT extended — visitor should pay quickly regardless.
 */

interface RescheduleBody {
  slot?: { startAt?: string; endAt?: string };
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const verified = verifyEventToken(token);
  if (!verified) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  let body: RescheduleBody;
  try {
    body = (await request.json()) as RescheduleBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const newStart = body.slot?.startAt ? new Date(body.slot.startAt) : null;
  const newEnd = body.slot?.endAt ? new Date(body.slot.endAt) : null;
  if (
    !newStart ||
    !newEnd ||
    Number.isNaN(newStart.getTime()) ||
    Number.isNaN(newEnd.getTime()) ||
    newEnd <= newStart
  ) {
    return NextResponse.json(
      { error: "Pick a valid new time." },
      { status: 400 },
    );
  }
  if (newStart.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Choose a time in the future." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const eventRef = db.collection("events").doc(verified.eventId);

  type Outcome = {
    newToken: string;
    pageSnap: FirebaseFirestore.DocumentSnapshot | null;
    event: CalendarEvent;
    rotatedHash: string;
    newStart: Date;
    newEnd: Date;
  };

  let outcome: Outcome | null = null;
  try {
    outcome = await db.runTransaction(async (txn) => {
      const eventSnap = await txn.get(eventRef);
      if (!eventSnap.exists) throw new TokenInvalid();
      const event = eventSnap.data() as CalendarEvent;
      if (event.publicTokenHash !== hashEventToken(token)) {
        throw new TokenInvalid();
      }
      const status = eventStatus(event);
      if (status !== "scheduled" && status !== "awaiting_payment") {
        throw new BadState(
          status === "cancelled"
            ? "This booking was cancelled. Please re-book."
            : "This meeting can't be rescheduled.",
        );
      }
      if (!event.bookingPageSlug) {
        throw new BadState("Reschedule isn't available for this booking.");
      }

      // Load the booking page inside the txn so its config is the same
      // one used to verify availability.
      const pageRef = db.doc(
        `subAccounts/${event.subAccountId}/bookingPages/${event.bookingPageSlug}`,
      );
      const pageSnap = await txn.get(pageRef);
      if (!pageSnap.exists) {
        throw new BadState(
          "The booking page is no longer available. Please cancel and re-book later.",
        );
      }
      const page = pageSnap.data() as BookingPage;

      // Busy events for the new slot's window — re-uses the same
      // pattern as the book route.
      const lookbackMs = 8 * 60 * 60_000;
      const queryFrom = new Date(newStart.getTime() - lookbackMs);
      const queryTo = new Date(newEnd.getTime() + 1000);
      const busySnap = await txn.get(
        db
          .collection("events")
          .where("subAccountId", "==", event.subAccountId)
          .where("startAt", ">=", queryFrom)
          .where("startAt", "<=", queryTo),
      );
      const busy: BusyEvent[] = [];
      for (const d of busySnap.docs) {
        if (d.id === eventRef.id) continue; // exclude our own slot
        const e = d.data() as CalendarEvent;
        const s = e.status ?? "scheduled";
        if (s !== "scheduled" && s !== "awaiting_payment") continue;
        const s2 = (e.startAt as { toDate?: () => Date } | null)?.toDate?.();
        const e2 = (e.endAt as { toDate?: () => Date } | null)?.toDate?.();
        if (!(s2 instanceof Date) || !(e2 instanceof Date)) continue;
        busy.push({ startAt: s2, endAt: e2 });
      }
      const free = computeAvailability({
        page,
        now: new Date(),
        fromInstant: new Date(newStart.getTime() - 1),
        toInstant: new Date(newEnd.getTime() + 1),
        busy,
      });
      const candidate: SlotCandidate = { startAt: newStart, endAt: newEnd };
      if (!isSlotAvailable(candidate, free)) {
        throw new SlotConflict();
      }

      const { token: newRawToken, hash: newHash } = issueEventToken(
        eventRef.id,
      );
      txn.update(eventRef, {
        startAt: newStart,
        endAt: newEnd,
        publicTokenHash: newHash,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        newToken: newRawToken,
        pageSnap: pageSnap,
        event: { ...event, publicTokenHash: newHash } as CalendarEvent,
        rotatedHash: newHash,
        newStart,
        newEnd,
      };
    });
  } catch (err) {
    if (err instanceof TokenInvalid) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    if (err instanceof BadState) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof SlotConflict) {
      return NextResponse.json(
        {
          error:
            "That time was just taken. Refresh and pick another option.",
        },
        { status: 409 },
      );
    }
    console.error("[events/reschedule] txn failed", err);
    return NextResponse.json(
      { error: "Couldn't reschedule. Try again." },
      { status: 500 },
    );
  }

  if (!outcome) {
    return NextResponse.json({ ok: true }); // unreachable; appease ts
  }
  const { newToken, event, pageSnap, newStart: nsa, newEnd: nea } = outcome;
  const page = pageSnap?.data() as BookingPage | undefined;
  const publicEventUrl = buildEventPublicUrl(newToken);

  // Side effects: reminder reschedule + activity + trigger + emails.
  await runRescheduleSideEffects({
    event,
    page,
    newRawToken: newToken,
    publicEventUrl,
    startAt: nsa,
    endAt: nea,
  });

  return NextResponse.json({
    ok: true,
    newStartAt: nsa.toISOString(),
    newEndAt: nea.toISOString(),
    newToken,
    publicEventUrl,
  });
}

class TokenInvalid extends Error {}
class BadState extends Error {
  constructor(public readonly message: string) {
    super(message);
  }
}
class SlotConflict extends Error {}

async function runRescheduleSideEffects(args: {
  event: CalendarEvent;
  page: BookingPage | undefined;
  newRawToken: string;
  publicEventUrl: string;
  startAt: Date;
  endAt: Date;
}): Promise<void> {
  const db = getAdminDb();
  const { event, page, newRawToken, publicEventUrl, startAt, endAt } = args;

  // Re-publish reminder callbacks with a fresh schedule nonce so the
  // QStash dedup key doesn't collapse onto the previous ones.
  if (page?.remindersEnabled) {
    await scheduleEventReminders({
      eventId: event.id,
      startAt,
      reminderOffsetsMinutes: page.reminderOffsetsMinutes,
      rawToken: newRawToken,
      pendingPayment: eventStatus(event) === "awaiting_payment",
      scheduleNonce: Date.now().toString(36),
    });
  }

  // Activity + automation trigger.
  if (event.contactId) {
    await recordBookingActivity(
      {
        id: event.id,
        title: event.title || "Meeting",
        contactId: event.contactId,
        bookingPageSlug: event.bookingPageSlug ?? null,
      },
      "booking_rescheduled",
    );
    await fireBookingTrigger(
      {
        agencyId: event.agencyId,
        subAccountId: event.subAccountId,
        contactId: event.contactId,
      },
      "event_rescheduled",
    );
  }

  // Visitor confirmation email + ICS (UPDATE, sequence+1 so calendar
  // clients overwrite the existing entry).
  if (!event.contactId || !emailIsConfigured()) return;
  try {
    const [contactSnap, subSnap] = await Promise.all([
      db.collection("contacts").doc(event.contactId).get(),
      db.doc(`subAccounts/${event.subAccountId}`).get(),
    ]);
    if (!contactSnap.exists || !subSnap.exists) return;
    const contact = contactSnap.data() as Contact;
    const sub = subSnap.data() as SubAccountDoc;
    if (!contact.email || contact.emailOptedOut) return;

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
    rendered.subject = `Updated: ${rendered.subject.replace(/^Confirmed: /, "")}`;
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
      sequence: 1, // bump so calendar apps treat as update
      attendeeEmail: contact.email,
      attendeeName: contact.name ?? undefined,
      organizerEmail: sub.replyToEmail ?? undefined,
      organizerName: sub.name ?? undefined,
    });

    if (eventStatus(event) === "awaiting_payment") {
      // Skip ICS for unconfirmed holds — same logic as the book route.
      await sendEmail({
        to: contact.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        replyTo: sub.replyToEmail ?? undefined,
        from: tenantFrom(sub),
      });
      return;
    }

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
    console.warn("[events/reschedule] confirmation send failed", err);
  }
}
