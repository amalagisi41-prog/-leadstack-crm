import { notFound } from "next/navigation";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  hashEventToken,
  verifyEventToken,
} from "@/lib/booking/event-token";
import { PublicEventView } from "@/components/booking/public-event-view";
import { eventStatus } from "@/types/events";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent } from "@/types/events";
import type { SubAccountDoc } from "@/types/tenancy";

export const dynamic = "force-dynamic";

/**
 * Public event-management page. Lets the attendee view their booking
 * details and reschedule / cancel without logging in.
 *
 * Security:
 *   1. HMAC token verified by `verifyEventToken()`.
 *   2. Loaded event's `publicTokenHash` compared against
 *      `hashEventToken(presentedToken)`. Mismatch (e.g. reschedule
 *      rotated, or a forged token) → 404, identical to "not found".
 *
 * Mirrors the /q/[token] quote pattern: server-renders the headline
 * + canonical details so the page is useful before any JS hydrates;
 * the interactive reschedule/cancel UX lands in the client component.
 */

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicEventPage({ params }: PageProps) {
  const { token } = await params;

  const verified = verifyEventToken(token);
  if (!verified) notFound();

  const db = getAdminDb();
  const eventSnap = await db.collection("events").doc(verified.eventId).get();
  if (!eventSnap.exists) notFound();
  const event = eventSnap.data() as CalendarEvent;
  if (event.publicTokenHash !== hashEventToken(token)) notFound();
  if (!event.bookingPageSlug) notFound();

  const [subSnap, pageSnap] = await Promise.all([
    db.doc(`subAccounts/${event.subAccountId}`).get(),
    db
      .doc(
        `subAccounts/${event.subAccountId}/bookingPages/${event.bookingPageSlug}`,
      )
      .get(),
  ]);
  if (!subSnap.exists) notFound();
  const sub = subSnap.data() as SubAccountDoc;
  const page = (pageSnap.exists ? pageSnap.data() : null) as BookingPage | null;

  const startAt = (
    event.startAt as { toDate?: () => Date } | null
  )?.toDate?.();
  const endAt = (
    event.endAt as { toDate?: () => Date } | null
  )?.toDate?.();
  if (!startAt || !endAt) notFound();

  const branding = {
    name: sub.name ?? "Booking",
    logoUrl: page?.logoUrl ?? sub.logoUrl ?? null,
    accentColor: page?.accentColor ?? null,
  };

  return (
    <PublicEventView
      token={token}
      subAccountId={event.subAccountId}
      eventId={event.id}
      status={eventStatus(event)}
      title={event.title ?? "Meeting"}
      pageName={page?.name ?? event.title ?? "Meeting"}
      pageSlug={event.bookingPageSlug}
      bookingPageStatus={page?.status ?? "published"}
      timezone={page?.timezone ?? "UTC"}
      durationMinutes={page?.durationMinutes ?? 30}
      startAt={startAt.toISOString()}
      endAt={endAt.toISOString()}
      paymentLinkUrl={event.paymentLinkUrl ?? null}
      paymentAmount={event.paymentAmount ?? null}
      paymentCurrency={event.paymentCurrency ?? null}
      branding={branding}
    />
  );
}
