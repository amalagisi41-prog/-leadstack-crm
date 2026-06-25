import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent } from "@/types/events";

/**
 * Client-side subscriptions for the per-sub-account booking pages list
 * + single-page editor hydration. All writes go through the Admin SDK
 * routes at /api/sub-accounts/[id]/booking-pages/* so client writes are
 * blocked at the rules level.
 *
 * Filters by `subAccountId` even though the docs live in a subcollection
 * — same defensive pattern as `subscribeToTerritories`. Lets us flip a
 * collection-group dump on if we ever add one.
 */
export function subscribeToBookingPages(
  subAccountId: string,
  callback: (pages: BookingPage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), "subAccounts", subAccountId, "bookingPages"),
    where("subAccountId", "==", subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<BookingPage, "id">) }),
      );
      list.sort((a, b) => a.name.localeCompare(b.name));
      callback(list);
    },
    (err) => onError?.(err),
  );
}

/** Subscribe to a single booking page by slug. Drives the editor screen. */
export function subscribeToBookingPage(
  subAccountId: string,
  slug: string,
  callback: (page: BookingPage | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), "subAccounts", subAccountId, "bookingPages", slug),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<BookingPage, "id">) });
    },
    (err) => onError?.(err),
  );
}

/**
 * Subscribe to every event produced by a given booking page. Uses the
 * `events(subAccountId, bookingPageSlug, startAt DESC)` composite index
 * added in Slice 1. Sorted by startAt descending so the most recent /
 * imminent bookings sit on top.
 *
 * Territory scoping: client-side filtered after fetch so the existing
 * composite index doesn't need a fourth field. Bookings per page are
 * bounded (typical case is a few dozen), so this is cheap.
 */
export function subscribeToBookingPageEvents(
  subAccountId: string,
  slug: string,
  callback: (events: CalendarEvent[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), "events"),
    where("subAccountId", "==", subAccountId),
    where("bookingPageSlug", "==", slug),
  );
  return onSnapshot(
    q,
    (snap) => {
      const events = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<CalendarEvent, "id">) }),
      );
      events.sort((a, b) => toMillis(b.startAt) - toMillis(a.startAt));
      callback(events);
    },
    (err) => onError?.(err),
  );
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
