import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  emailIsConfigured,
  sendEmail,
  tenantFrom,
} from "@/lib/comms/resend";
import { Resend } from "resend";
import { buildPaypalAmountUrl } from "@/lib/paypal/payment-link";
import {
  computeAvailability,
  isSlotAvailable,
  type BusyEvent,
  type SlotCandidate,
} from "@/lib/booking/availability";
import {
  loadHostUpcomingCounts,
  pickLeastLoadedHost,
} from "@/lib/booking/hosts";
import {
  buildEventPublicUrl,
  issueEventToken,
} from "@/lib/booking/event-token";
import { generateIcs } from "@/lib/booking/ics";
import { reconcileBookingContact } from "@/lib/booking/contact-reconcile";
import {
  emitBookingWebhook,
  fireBookingTrigger,
  recordBookingActivity,
  schedulePaymentAutoExpire,
  scheduleEventReminders,
} from "@/lib/booking/lifecycle";
import {
  renderBookingConfirmationEmail,
  renderBookingPaymentPendingEmail,
} from "@/lib/booking/email";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent } from "@/types/events";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * Public booking submission. Unauthenticated; security comes from:
 *  - the per-page slot-availability re-check inside a Firestore
 *    transaction (no double-book even on a stale UI),
 *  - per-IP + per-sub-account rate limits,
 *  - the BookingPage `status` gate (drafts return 404 same as
 *    availability),
 *  - validated intake payload (mandatory name/email/phone + per-page
 *    custom field rules).
 *
 * On success:
 *  - reconciles a Contact (email-match within the sub-account; new
 *    contacts stamp `source: "booking-page"` + the page's
 *    `defaultTerritoryId`),
 *  - creates an `events/{id}` doc carrying full booking metadata
 *    (status, source, bookingPageSlug, publicTokenHash, payment fields
 *    when applicable),
 *  - mints + persists an HMAC public token (raw token only ever in the
 *    outbound email URL),
 *  - sends a confirmation OR payment-pending email via tenantFrom (uses
 *    the sub-account's verified sending domain when configured),
 *  - schedules QStash reminder callbacks (T-24h + T-1h) for scheduled
 *    bookings, or the auto-expire callback for awaiting-payment holds,
 *  - fires the `event_booked` automation trigger (plumbing only — same
 *    v1 caveat as the quote triggers).
 */

// ── Soft rate limits (per IP + per sub-account, in-memory LRU) ──
const IP_HOURLY_CAP = 10;
const SUB_HOURLY_CAP = 100;
const WINDOW_MS = 60 * 60_000;
const ipHits = new Map<string, number[]>();
const subHits = new Map<string, number[]>();

function pushAndCheck(
  bucket: Map<string, number[]>,
  key: string,
  cap: number,
): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = (bucket.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= cap) {
    bucket.set(key, arr);
    return true;
  }
  arr.push(now);
  bucket.set(key, arr);
  if (bucket.size > 5000) {
    const oldest = bucket.keys().next().value;
    if (oldest !== undefined) bucket.delete(oldest);
  }
  return false;
}

function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SubmittedSlot {
  startAt?: string;
  endAt?: string;
}

interface BookBody {
  slot?: SubmittedSlot;
  name?: string;
  email?: string;
  phone?: string;
  extras?: Record<string, string>;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ saId: string; slug: string }> },
) {
  const { saId, slug } = await ctx.params;
  const ip = getClientIp(request);
  if (pushAndCheck(ipHits, ip, IP_HOURLY_CAP)) {
    return NextResponse.json(
      { error: "Too many booking attempts. Try again later." },
      { status: 429 },
    );
  }
  if (pushAndCheck(subHits, saId, SUB_HOURLY_CAP)) {
    return NextResponse.json(
      { error: "Booking page is busy. Try again later." },
      { status: 429 },
    );
  }

  let body: BookBody;
  try {
    body = (await request.json()) as BookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = (body.phone ?? "").trim();
  if (!name || name.length > 120) {
    return NextResponse.json(
      { error: "Name is required (max 120 chars)." },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 },
    );
  }
  if (!phone || phone.length > 40) {
    return NextResponse.json(
      { error: "Phone is required." },
      { status: 400 },
    );
  }
  const slot = body.slot;
  if (!slot?.startAt || !slot?.endAt) {
    return NextResponse.json(
      { error: "Pick a time before booking." },
      { status: 400 },
    );
  }
  const slotStart = new Date(slot.startAt);
  const slotEnd = new Date(slot.endAt);
  if (
    Number.isNaN(slotStart.getTime()) ||
    Number.isNaN(slotEnd.getTime()) ||
    slotEnd <= slotStart
  ) {
    return NextResponse.json(
      { error: "Selected slot is invalid." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const pageSnap = await db
    .doc(`subAccounts/${saId}/bookingPages/${slug}`)
    .get();
  if (!pageSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const page = pageSnap.data() as BookingPage;
  if (page.status !== "published") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Validate page-defined required intake fields. (UI also enforces.)
  const extras: Record<string, string> = {};
  for (const f of page.intakeFields) {
    const raw = body.extras?.[f.id];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (f.required && !value) {
      return NextResponse.json(
        { error: `Please answer: ${f.label}` },
        { status: 400 },
      );
    }
    if (value.length > 2000) {
      return NextResponse.json(
        { error: `Answer too long for "${f.label}"` },
        { status: 400 },
      );
    }
    if (f.type === "select" && value) {
      if (!(f.options ?? []).includes(value)) {
        return NextResponse.json(
          { error: `Invalid option for "${f.label}"` },
          { status: 400 },
        );
      }
    }
    if (value) extras[f.id] = value;
  }

  const subSnap = await db.doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account missing" }, { status: 500 });
  }
  const sub = subSnap.data() as SubAccountDoc;
  const agencyId = sub.agencyId;

  // Payment gate is only honoured when the sub-account has PayPal
  // connected. Defense in depth: the editor also rejects payment
  // configs without PayPal, but a config drift shouldn't let a
  // visitor land on a "Pay" button that doesn't exist.
  const paymentRequired = !!page.payment && !!sub.paypalConfig;

  // ── Transactional create with re-verify ─────────────────────────
  // Pull a tight window of busy events around the requested slot,
  // re-run availability, and only write if the slot survives. A
  // visitor on a stale UI gets 409, not a double-booked event.
  const lookbackMs = 8 * 60 * 60_000;
  const queryFrom = new Date(slotStart.getTime() - lookbackMs);
  const queryTo = new Date(slotEnd.getTime() + 1000);
  const eventsRef = db.collection("events");
  const eventDocRef = eventsRef.doc(); // pre-allocate id for token mint
  const now = new Date();

  // Team mode: when the page lists hosts, availability is per-host and the
  // booking is auto-assigned to the least-loaded free host. Pre-compute each
  // host's upcoming load OUTSIDE the transaction (slightly stale is fine).
  const hosts = page.hosts ?? [];
  const teamMode = hosts.length > 0;
  const loadByHost = teamMode
    ? await loadHostUpcomingCounts(
        saId,
        hosts.map((h) => h.uid),
        now,
      )
    : new Map<string, number>();

  type CreatedPayload = {
    eventDocRef: FirebaseFirestore.DocumentReference;
    territoryId: string;
    contactId: string;
    contactCreated: boolean;
    title: string;
    rawToken: string;
    tokenHash: string;
    paymentLinkUrl: string | null;
    paymentHoldExpiresAt: Date | null;
  };

  let created: CreatedPayload;
  try {
    created = await db.runTransaction(async (txn) => {
      const busySnap = await txn.get(
        eventsRef
          .where("subAccountId", "==", saId)
          .where("startAt", ">=", queryFrom)
          .where("startAt", "<=", queryTo),
      );
      // Parse occupying events in the window, tagged by assigned host.
      //  - `occupying`     — every busy event (single mode treats all as conflicts)
      //  - `sharedBusy`    — unassigned events; block EVERY host in team mode
      //  - `occupyingByHost` — a host's own bookings; block only that host
      const occupying: BusyEvent[] = [];
      const sharedBusy: BusyEvent[] = [];
      const occupyingByHost = new Map<string, BusyEvent[]>();
      for (const d of busySnap.docs) {
        const e = d.data() as CalendarEvent;
        const s = e.status ?? "scheduled";
        if (s !== "scheduled" && s !== "awaiting_payment") continue;
        const startVal = (
          e.startAt as { toDate?: () => Date } | null
        )?.toDate?.();
        const endVal = (e.endAt as { toDate?: () => Date } | null)?.toDate?.();
        if (!(startVal instanceof Date) || !(endVal instanceof Date)) continue;
        const be: BusyEvent = { startAt: startVal, endAt: endVal };
        occupying.push(be);
        const host = e.assignedToUid ?? null;
        if (host == null) {
          sharedBusy.push(be);
        } else {
          const arr = occupyingByHost.get(host) ?? [];
          arr.push(be);
          occupyingByHost.set(host, arr);
        }
      }

      const candidate: SlotCandidate = { startAt: slotStart, endAt: slotEnd };
      let assignedToUid: string | null = null;
      let assignedToName: string | null = null;

      if (teamMode) {
        // A host is free at this slot iff the slot survives availability
        // against (shared busy ∪ that host's bookings). Reuses the same pure
        // calculator the union availability uses, so the re-verify can't
        // disagree with what the visitor was shown.
        const freeHosts = hosts.filter((h) => {
          const hostBusy = occupyingByHost.get(h.uid) ?? [];
          const free = computeAvailability({
            page,
            now,
            fromInstant: new Date(slotStart.getTime() - 1),
            toInstant: new Date(slotEnd.getTime() + 1),
            busy: [...sharedBusy, ...hostBusy],
          });
          return isSlotAvailable(candidate, free);
        });
        const chosen = pickLeastLoadedHost(freeHosts, loadByHost);
        if (!chosen) throw new SlotConflict();
        assignedToUid = chosen.uid;
        assignedToName = chosen.name;
      } else {
        const free = computeAvailability({
          page,
          now,
          fromInstant: new Date(slotStart.getTime() - 1),
          toInstant: new Date(slotEnd.getTime() + 1),
          busy: occupying,
        });
        if (!isSlotAvailable(candidate, free)) {
          throw new SlotConflict();
        }
      }

      // Reconcile the contact OUTSIDE the txn would be ideal (Admin SDK
      // queries inside a txn lock the read set), but the email-equality
      // query is cheap and the txn is short. Keep it inside so we don't
      // need a compensating delete on a downstream failure.
      const reconciled = await reconcileBookingContact({
        agencyId,
        subAccountId: saId,
        email,
        name,
        phone,
        defaultTerritoryId: page.defaultTerritoryId,
      });

      const territoryId =
        page.defaultTerritoryId && page.defaultTerritoryId.length > 0
          ? page.defaultTerritoryId
          : GLOBAL_TERRITORY_ID;

      const status = paymentRequired ? "awaiting_payment" : "scheduled";
      let paymentLinkUrl: string | null = null;
      let paymentHoldExpiresAt: Date | null = null;
      if (paymentRequired && page.payment && sub.paypalConfig) {
        paymentLinkUrl = buildPaypalAmountUrl({
          paypal: sub.paypalConfig,
          amount: page.payment.amount,
          currency: page.payment.currency,
        });
        paymentHoldExpiresAt = new Date(
          now.getTime() + page.payment.holdHours * 60 * 60_000,
        );
      }

      const title = `${page.name} — ${name}`;
      // Mint token now so we can store hash atomically.
      const { token, hash } = issueEventToken(eventDocRef.id);

      // Build the event doc. All new fields are optional in the type so
      // unused ones land as `null` cleanly.
      const eventDoc = {
        id: eventDocRef.id,
        title,
        startAt: slotStart,
        endAt: slotEnd,
        contactId: reconciled.id,
        location: "",
        // Snapshot the page's meeting URL onto the event so a later edit
        // to the page doesn't rewrite historical invites.
        meetingUrl: page.meetingUrl ?? null,
        notes: extras
          ? Object.entries(extras)
              .map(([k, v]) => `${labelForField(page, k)}: ${v}`)
              .join("\n")
          : "",
        agencyId,
        subAccountId: saId,
        createdByUid: "booking-page",
        territoryId,
        status,
        source: "booking_page",
        bookingPageSlug: page.slug,
        publicTokenHash: hash,
        paymentRequired,
        paymentAmount: page.payment?.amount ?? null,
        paymentCurrency: page.payment?.currency ?? null,
        paymentLinkUrl,
        paidAt: null,
        paidByUid: null,
        paymentHoldExpiresAt,
        assignedToUid,
        assignedToName,
        cancelledAt: null,
        cancelledByVisitor: null,
        cancelReason: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      txn.set(eventDocRef, eventDoc);

      return {
        eventDocRef,
        territoryId,
        contactId: reconciled.id,
        contactCreated: reconciled.created,
        title,
        rawToken: token,
        tokenHash: hash,
        paymentLinkUrl,
        paymentHoldExpiresAt,
      };
    });
  } catch (err) {
    if (err instanceof SlotConflict) {
      return NextResponse.json(
        {
          error:
            "That slot was just taken. Refresh the page and pick another time.",
        },
        { status: 409 },
      );
    }
    console.error("[booking/book] transaction failed", err);
    return NextResponse.json(
      { error: "Couldn't reserve the slot. Try again." },
      { status: 500 },
    );
  }

  // ── Post-write side effects (best-effort) ──────────────────────
  const publicEventUrl = buildEventPublicUrl(created.rawToken);
  const appHost =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "")
      ?.replace(/\/.*$/, "")
      ?.toLowerCase() ?? "leadstack.dev";

  // Confirmation / payment-pending email.
  if (emailIsConfigured()) {
    try {
      const rendered = paymentRequired
        ? renderBookingPaymentPendingEmail({
            recipientName: name,
            businessName: sub.name ?? "Booking",
            businessLogoUrl: sub.logoUrl,
            page: {
              name: page.name,
              durationMinutes: page.durationMinutes,
              timezone: page.timezone,
              payment: page.payment,
              confirmationMessage: page.confirmationMessage,
            },
            startAt: slotStart,
            endAt: slotEnd,
            publicEventUrl,
            paymentUrl: created.paymentLinkUrl,
          })
        : renderBookingConfirmationEmail({
            recipientName: name,
            businessName: sub.name ?? "Booking",
            businessLogoUrl: sub.logoUrl,
            page: {
              name: page.name,
              durationMinutes: page.durationMinutes,
              timezone: page.timezone,
              payment: page.payment,
              confirmationMessage: page.confirmationMessage,
            },
            startAt: slotStart,
            endAt: slotEnd,
            meetingUrl: page.meetingUrl ?? null,
            publicEventUrl,
          });

      // ICS only for confirmed bookings (not awaiting_payment) so we
      // don't pollute attendee calendars with holds.
      const attachments = !paymentRequired
        ? buildIcsAttachment({
            eventId: created.eventDocRef.id,
            startAt: slotStart,
            endAt: slotEnd,
            domain: appHost,
            title: created.title,
            description: page.confirmationMessage || "",
            // Calendar apps render a clickable "Join" affordance when
            // LOCATION is a URL — Zoom / Meet / Whereby all auto-detect.
            location: page.meetingUrl ?? "",
            organizerEmail: sub.replyToEmail ?? undefined,
            organizerName: sub.name ?? undefined,
            attendeeEmail: email,
            attendeeName: name,
          })
        : undefined;

      await sendEmailWithIcs({
        to: email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        replyTo: sub.replyToEmail ?? undefined,
        from: tenantFrom(sub),
        icsAttachment: attachments,
      });
    } catch (err) {
      console.warn("[booking/book] confirmation send failed", err);
    }
  }

  // Reminder schedule (no-op when payment is pending — gets scheduled
  // on mark-paid in Slice 8).
  if (page.remindersEnabled) {
    await scheduleEventReminders({
      eventId: created.eventDocRef.id,
      startAt: slotStart,
      reminderOffsetsMinutes: page.reminderOffsetsMinutes,
      rawToken: created.rawToken,
      pendingPayment: paymentRequired,
    });
  }

  // Auto-expire schedule for unpaid holds.
  if (paymentRequired && created.paymentHoldExpiresAt) {
    await schedulePaymentAutoExpire({
      eventId: created.eventDocRef.id,
      expiresAt: created.paymentHoldExpiresAt,
    });
  }

  // Activity + automation trigger.
  await recordBookingActivity(
    {
      id: created.eventDocRef.id,
      title: created.title,
      contactId: created.contactId,
      bookingPageSlug: page.slug,
    },
    "booking_page_booked",
  );
  await fireBookingTrigger(
    {
      agencyId,
      subAccountId: saId,
      contactId: created.contactId,
    },
    "event_booked",
  );
  void emitBookingWebhook({
    eventId: created.eventDocRef.id,
    agencyId,
    subAccountId: saId,
    type: "booking_page_booked",
  });

  // Post-booking redirect — confirmed (free) bookings only. Paid holds
  // stay on the in-app confirmation so the PayPal CTA is always shown.
  // Append booking_id + email so the destination page can de-dupe
  // conversions + fire pixel Advanced Matching. A malformed stored URL
  // never breaks a successful booking — it just falls back to no redirect.
  let redirectUrl: string | null = null;
  if (!paymentRequired && page.redirectUrl) {
    try {
      const u = new URL(page.redirectUrl);
      // Append tracking params unless the operator opted out (legacy docs
      // with the field absent default to appending).
      if (page.redirectAppendParams !== false) {
        u.searchParams.set("booking_id", created.eventDocRef.id);
        u.searchParams.set("email", email);
      }
      redirectUrl = u.toString();
    } catch (err) {
      console.warn("[booking/book] invalid redirectUrl, skipping", err);
    }
  }

  return NextResponse.json({
    ok: true,
    eventId: created.eventDocRef.id,
    status: paymentRequired ? "awaiting_payment" : "scheduled",
    paymentUrl: created.paymentLinkUrl ?? null,
    publicEventUrl,
    confirmationMessage: page.confirmationMessage || null,
    redirectUrl,
  });
}

class SlotConflict extends Error {}

function labelForField(page: BookingPage, id: string): string {
  return page.intakeFields.find((f) => f.id === id)?.label ?? id;
}

// ── ICS attachment helper ──────────────────────────────────────────
// Resend supports attachments via the `attachments` field — pass a
// content string (base64) + filename + content type. The high-level
// sendEmail wrapper doesn't expose attachments, so we invoke Resend
// directly when an ICS needs to ride along. Falls back to the standard
// wrapper when no attachment is required.

interface SendWithIcs {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  from?: string;
  icsAttachment?: { filename: string; content: string };
}

function buildIcsAttachment(params: {
  eventId: string;
  startAt: Date;
  endAt: Date;
  domain: string;
  title: string;
  description: string;
  location: string;
  organizerEmail?: string;
  organizerName?: string;
  attendeeEmail: string;
  attendeeName: string;
}): { filename: string; content: string } {
  const ics = generateIcs({
    uid: params.eventId,
    domain: params.domain,
    startAt: params.startAt,
    endAt: params.endAt,
    summary: params.title,
    description: params.description,
    location: params.location,
    organizerEmail: params.organizerEmail,
    organizerName: params.organizerName,
    attendeeEmail: params.attendeeEmail,
    attendeeName: params.attendeeName,
    method: "REQUEST",
    status: "CONFIRMED",
    sequence: 0,
  });
  // Base64-encode for the Resend attachments[].content field.
  const content = Buffer.from(ics, "utf-8").toString("base64");
  return { filename: "invite.ics", content };
}

async function sendEmailWithIcs(input: SendWithIcs): Promise<void> {
  if (!input.icsAttachment) {
    await sendEmail({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
      from: input.from,
    });
    return;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing");
  const client = new Resend(key);
  const from = input.from ?? process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM missing");
  const res = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
    attachments: [
      {
        filename: input.icsAttachment.filename,
        content: input.icsAttachment.content,
      },
    ],
  });
  if (res.error) throw new Error(res.error.message || "Resend failed");
}
