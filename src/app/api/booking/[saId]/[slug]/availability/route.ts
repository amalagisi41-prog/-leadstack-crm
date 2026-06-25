import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  computeAvailability,
  computeUnionAvailability,
  type BusyEventWithHost,
  type SlotCandidate,
} from "@/lib/booking/availability";
import { eventStatus, eventOccupiesSlot } from "@/types/events";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent } from "@/types/events";

/**
 * Public availability endpoint for a booking page. Unauthenticated;
 * security is per-page (only published pages return slots) plus a soft
 * per-IP rate limit.
 *
 *   GET /api/booking/[saId]/[slug]/availability?from=ISO&to=ISO
 *
 * - 404 if the page doesn't exist or isn't published.
 * - 200 with { slots: [{ startAt, endAt }] } on success.
 *
 * Server-side reads via Admin SDK so Firestore rules can stay
 * member-scoped on the booking-page doc + events. Computation is the
 * pure function in `lib/booking/availability.ts`.
 */

// ── Soft rate limit: per-IP, in-memory LRU. Mirrors web-chat rate-limit ──
const HOURLY_CAP = 120; // ~2/min ought to be plenty for legit visitors
const WINDOW_MS = 60 * 60_000;
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = (ipHits.get(ip) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= HOURLY_CAP) {
    ipHits.set(ip, arr);
    return true;
  }
  arr.push(now);
  ipHits.set(ip, arr);
  // Cheap LRU pressure: keep map size bounded.
  if (ipHits.size > 5000) {
    const oldest = ipHits.keys().next().value;
    if (oldest !== undefined) ipHits.delete(oldest);
  }
  return false;
}

function getClientIp(request: Request): string {
  // x-forwarded-for is the standard proxy header. Fall back to a
  // sentinel so unconfigured envs still rate-limit (per-instance).
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ saId: string; slug: string }> },
) {
  const { saId, slug } = await ctx.params;

  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  const db = getAdminDb();
  const pageSnap = await db
    .doc(`subAccounts/${saId}/bookingPages/${slug}`)
    .get();
  // Treat "missing" and "draft" as the same response so we don't leak
  // the existence of unpublished pages.
  if (!pageSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const page = pageSnap.data() as BookingPage;
  if (page.status !== "published") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Optional query params. Default to "now" / `now + visibleDays` which
  // computeAvailability also enforces, so passing nothing is fine.
  // `excludeEventId` is used by the reschedule flow so the attendee sees
  // their own current slot as available.
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const excludeEventId = url.searchParams.get("excludeEventId");
  const now = new Date();
  const fromInstant = fromParam ? new Date(fromParam) : undefined;
  const toInstant = toParam ? new Date(toParam) : undefined;
  if (fromInstant && Number.isNaN(fromInstant.getTime())) {
    return NextResponse.json(
      { error: "Invalid `from` query param." },
      { status: 400 },
    );
  }
  if (toInstant && Number.isNaN(toInstant.getTime())) {
    return NextResponse.json(
      { error: "Invalid `to` query param." },
      { status: 400 },
    );
  }

  // Load busy events for the window. Query by subAccountId + startAt
  // range — uses the new `events(subAccountId, startAt)` composite
  // index from Slice 1. We pull a generous window (the page's
  // visibleDays + a small buffer) so the conflict check sees events
  // that started before `fromInstant` and bleed in.
  const horizonEnd =
    toInstant ?? new Date(now.getTime() + page.visibleDays * 24 * 60 * 60_000);
  // Look back by the longest possible single event (cap at 8 hours —
  // longer than any normal booking) so we catch events that started
  // before `now` but haven't ended yet.
  const lookbackMs = 8 * 60 * 60_000;
  const queryFrom = new Date(
    (fromInstant ?? now).getTime() - lookbackMs,
  );

  // Busy events tagged with their assigned host — the host tag is only used
  // in team mode; single mode ignores it.
  const busy: BusyEventWithHost[] = [];
  try {
    const eventsSnap = await db
      .collection("events")
      .where("subAccountId", "==", saId)
      .where("startAt", ">=", queryFrom)
      .where("startAt", "<=", horizonEnd)
      .get();

    for (const d of eventsSnap.docs) {
      // Skip the rescheduling event's own slot — without this the
      // attendee can't see their current time as available again, and
      // could be told there are no openings if their slot is one of the
      // last in the page's window.
      if (excludeEventId && d.id === excludeEventId) continue;
      const e = d.data() as CalendarEvent;
      if (!eventOccupiesSlot(eventStatus(e))) continue;
      // Firestore timestamps → Date. Defensive: skip docs with malformed
      // timestamps so a single bad event can't kill the response.
      const startAt = (e.startAt as { toDate?: () => Date } | null)?.toDate?.();
      const endAt = (e.endAt as { toDate?: () => Date } | null)?.toDate?.();
      if (!(startAt instanceof Date) || !(endAt instanceof Date)) continue;
      busy.push({ startAt, endAt, assignedToUid: e.assignedToUid ?? null });
    }
  } catch (err) {
    // Most common cause: missing Firestore composite index in production.
    // Firebase returns FAILED_PRECONDITION with a link in the error message
    // to auto-create the index. Surfacing this with the saId + slug context
    // makes the Vercel log line greppable.
    const message = err instanceof Error ? err.message : "unknown";
    console.error(
      `[booking/availability] events query failed sa=${saId} slug=${slug}: ${message}`,
      err,
    );
    return NextResponse.json(
      {
        error: "availability_query_failed",
        message:
          "Couldn't load availability. The deployment may be missing a Firestore index; ask the agency operator to deploy indexes (`firebase deploy --only firestore:indexes`).",
      },
      { status: 500 },
    );
  }

  const hosts = page.hosts ?? [];
  const teamMode = hosts.length > 0;

  let slots: SlotCandidate[];
  try {
    slots = teamMode
      ? computeUnionAvailability({
          page,
          now,
          fromInstant,
          toInstant,
          busy,
          hostUids: hosts.map((h) => h.uid),
        })
      : computeAvailability({
          page,
          now,
          fromInstant,
          toInstant,
          // Single mode treats every occupying event as a shared conflict.
          busy: busy.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
        });
  } catch (err) {
    // Defensive: computeAvailability can throw on malformed page config
    // (missing workingHours, invalid timezone, etc.). Log with context so
    // the operator can identify the broken booking page.
    const message = err instanceof Error ? err.message : "unknown";
    console.error(
      `[booking/availability] compute failed sa=${saId} slug=${slug}: ${message}`,
      err,
    );
    return NextResponse.json(
      {
        error: "availability_compute_failed",
        message:
          "Couldn't compute availability — the booking page config may be malformed (working hours / timezone / duration).",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    slots: slots.map((s) => ({
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
    })),
    timezone: page.timezone,
    durationMinutes: page.durationMinutes,
  });
}
