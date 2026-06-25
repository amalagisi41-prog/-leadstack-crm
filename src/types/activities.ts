import type { Timestamp, FieldValue } from "firebase/firestore";
import type { ActivityType } from "@/types/contacts";

export type ActivityMeta = {
  dealId?: string;
  fromStageId?: string;
  toStageId?: string;
  bookingId?: string;
  /** Quote lifecycle rows (sent / viewed / accepted / declined / paid)
   *  carry the source quote's id + human-readable number. Written by
   *  src/lib/quotes/lifecycle.ts so the timeline can surface a "View
   *  quote" link in v2 polish. */
  quoteId?: string;
  quoteNumber?: string;
  /** Territory retag rows. `null` id resolves to "Global". Cascade
   *  counts (how many child records moved) sit alongside so the
   *  timeline can read "Account moved from California to Utah (3
   *  deals, 1 quote)" without re-querying. */
  fromTerritoryId?: string | null;
  toTerritoryId?: string | null;
  movedDeals?: number;
  movedQuotes?: number;
  movedTasks?: number;
  movedEvents?: number;
  /** Booking lifecycle rows carry the source event + booking page slug
   *  so the timeline can deep-link to the calendar event + the page
   *  that produced it. `paymentAmount` / `paymentCurrency` populate on
   *  `booking_payment_received` so the row reads as
   *  "Payment received: $150 AUD". */
  eventId?: string;
  bookingPageSlug?: string;
  paymentAmount?: number;
  paymentCurrency?: string;
} | null;

export interface ActivityDoc {
  id: string;
  type: ActivityType;
  content: string;
  createdBy: string;
  createdAt: Timestamp | FieldValue | null;
  meta: ActivityMeta;
}
