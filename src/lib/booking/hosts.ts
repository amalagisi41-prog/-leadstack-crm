import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { eventOccupiesSlot, eventStatus } from "@/types/events";
import type { CalendarEvent } from "@/types/events";
import type { BookingHost } from "@/types/booking";
import type { SubAccountMemberDoc } from "@/types/tenancy";

/**
 * Server-side helpers for booking-page **team mode** (round-robin).
 *
 * A booking page may carry a `hosts: BookingHost[]` list. When non-empty the
 * page runs in team mode: availability is the union of each host's free time
 * and each booking is auto-assigned to the least-loaded free host. These
 * helpers cover the two server touch-points — resolving the host list against
 * live membership on save, and picking the host at book time.
 */

/**
 * Resolve a requested host list against the sub-account's live membership:
 * keep only uids that are ACTIVE members, re-snapshot each `name` from the
 * member doc (never trust the client-supplied name), preserve request order,
 * and drop removed/unknown members. Called from the booking-page POST/PATCH
 * routes after shape validation.
 */
export async function resolveBookingHosts(
  subAccountId: string,
  requested: BookingHost[] | undefined | null,
): Promise<BookingHost[]> {
  const reqList = requested ?? [];
  if (reqList.length === 0) return [];

  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/subAccountMembers`)
    .get();
  const activeByUid = new Map<string, SubAccountMemberDoc>();
  for (const d of snap.docs) {
    const m = d.data() as SubAccountMemberDoc;
    const uid = m.uid ?? d.id;
    if (m.status === "active") activeByUid.set(uid, m);
  }

  const out: BookingHost[] = [];
  const seen = new Set<string>();
  for (const h of reqList) {
    if (seen.has(h.uid)) continue;
    const m = activeByUid.get(h.uid);
    if (!m) continue; // dropped: no longer an active member
    seen.add(h.uid);
    const name = (m.displayName || m.email || h.name || "Host").slice(0, 120);
    out.push({ uid: h.uid, name });
  }
  return out;
}

/**
 * Count each host's upcoming occupying bookings — a load proxy for the
 * least-loaded tiebreak. One bounded query per host; runs BEFORE the book
 * transaction (slightly stale is fine, fairness doesn't need transactional
 * accuracy). Requires the `events(subAccountId, assignedToUid, startAt)`
 * composite index.
 */
export async function loadHostUpcomingCounts(
  subAccountId: string,
  hostUids: string[],
  now: Date,
): Promise<Map<string, number>> {
  const db = getAdminDb();
  const counts = new Map<string, number>();
  await Promise.all(
    hostUids.map(async (uid) => {
      try {
        const snap = await db
          .collection("events")
          .where("subAccountId", "==", subAccountId)
          .where("assignedToUid", "==", uid)
          .where("startAt", ">=", now)
          .get();
        let n = 0;
        for (const d of snap.docs) {
          const e = d.data() as CalendarEvent;
          if (eventOccupiesSlot(eventStatus(e))) n++;
        }
        counts.set(uid, n);
      } catch (err) {
        // Most likely the composite index isn't deployed yet — degrade to a
        // zero count so assignment still works (just not load-balanced).
        console.warn(`[booking/hosts] load count failed uid=${uid}`, err);
        counts.set(uid, 0);
      }
    }),
  );
  return counts;
}

/**
 * Pick the least-loaded host from an already-filtered list of hosts that are
 * free at the chosen slot. Tiebreak: the page's host order (first wins).
 * Returns null when the list is empty (caller treats as 409 — slot full).
 */
export function pickLeastLoadedHost(
  freeHosts: BookingHost[],
  loadByHost: Map<string, number>,
): BookingHost | null {
  if (freeHosts.length === 0) return null;
  let best = freeHosts[0];
  let bestLoad = loadByHost.get(best.uid) ?? 0;
  for (let i = 1; i < freeHosts.length; i++) {
    const load = loadByHost.get(freeHosts[i].uid) ?? 0;
    if (load < bestLoad) {
      best = freeHosts[i];
      bestLoad = load;
    }
  }
  return best;
}
