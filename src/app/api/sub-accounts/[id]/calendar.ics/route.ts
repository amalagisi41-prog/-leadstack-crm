import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  verifyCalendarFeedToken,
  verifyHostCalendarFeedToken,
} from "@/lib/booking/calendar-feed-token";
import {
  generateIcsFeed,
  type FeedEventInput,
} from "@/lib/booking/ics-feed";
import { eventStatus } from "@/types/events";
import type { CalendarEvent } from "@/types/events";
import type { SubAccountMemberDoc } from "@/types/tenancy";

/**
 * Public read-only calendar feed for one sub-account. Powers the
 * "Subscribe to my LeadStack bookings from Google Calendar" UX.
 *
 *   GET /api/sub-accounts/{id}/calendar.ics?t=<token>
 *
 * Security: HMAC token in the URL (see `calendar-feed-token.ts`). The
 * path is in PUBLIC_PATH_PATTERNS — no session-cookie auth — because
 * Google Calendar's polling agent is unauthenticated.
 *
 * Window: the feed includes events with `startAt >= now - 30 days` and
 * caps at 500 events. Cancelled events are included with STATUS:CANCELLED
 * so the subscriber's calendar removes them on the next poll.
 *
 * Caching: 5-minute cache header. Google polls at its own cadence
 * (typically 8-24h); the cache just protects against multiple poller
 * instances (Apple + Google + Outlook on the same operator) thundering.
 */

const FEED_LOOKBACK_DAYS = 30;
const FEED_EVENT_CAP = 500;

function statusForIcs(
  s: ReturnType<typeof eventStatus>,
): FeedEventInput["status"] {
  if (s === "cancelled") return "CANCELLED";
  if (s === "awaiting_payment") return "TENTATIVE";
  return "CONFIRMED";
}

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const m = v as { toDate?: () => Date };
  if (typeof m.toDate === "function") return m.toDate();
  return null;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("t") ?? "";
  const host = url.searchParams.get("host");

  const db = getAdminDb();

  // Auth + scope. Two feeds share this route:
  //  - all-bookings (no `host`)     → the sub-account token.
  //  - per-host (`?host=<uid>`)      → a token bound to (subAccountId, uid),
  //    plus an active-member check so a removed member's leaked feed stops
  //    returning data.
  // 404 (not 401) on any failure — leaks less about what exists.
  let hostMemberName: string | null = null;
  if (host) {
    if (!verifyHostCalendarFeedToken(subAccountId, host, token)) {
      return new Response("Not found", { status: 404 });
    }
    const memberSnap = await db
      .doc(`subAccounts/${subAccountId}/subAccountMembers/${host}`)
      .get();
    const member = memberSnap.exists
      ? (memberSnap.data() as SubAccountMemberDoc)
      : null;
    if (!member || member.status !== "active") {
      return new Response("Not found", { status: 404 });
    }
    hostMemberName = member.displayName || member.email || null;
  } else if (!verifyCalendarFeedToken(subAccountId, token)) {
    return new Response("Not found", { status: 404 });
  }
  const hostMode = host != null;

  // Identify the sub-account for the calendar display name. If the doc
  // is missing the feed still works, just labelled "LeadStack bookings".
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const subName = (subSnap.data()?.name as string | undefined) ?? null;
  let calendarName: string;
  if (hostMode) {
    const who = hostMemberName ? `${hostMemberName}'s` : "My";
    calendarName = subName
      ? `${subName} — ${who} bookings`
      : `${who} LeadStack bookings`;
  } else {
    calendarName = subName
      ? `${subName} — LeadStack bookings`
      : "LeadStack bookings";
  }

  const lookback = new Date(Date.now() - FEED_LOOKBACK_DAYS * 24 * 60 * 60_000);
  let q = db
    .collection("events")
    .where("subAccountId", "==", subAccountId);
  if (hostMode && host) {
    // Per-host feed: only this member's assigned bookings. Uses the
    // events(subAccountId, assignedToUid, startAt) composite index.
    q = q.where("assignedToUid", "==", host);
  }
  q = q
    .where("startAt", ">=", Timestamp.fromDate(lookback))
    .orderBy("startAt", "asc")
    .limit(FEED_EVENT_CAP);
  let eventsSnap;
  try {
    eventsSnap = await q.get();
  } catch (err) {
    // Most likely a missing composite index in production — surface a
    // greppable log and a soft 503 so the poller just retries later.
    console.error(
      `[calendar.ics] events query failed sa=${subAccountId} host=${host ?? "-"}`,
      err,
    );
    return new Response("Calendar temporarily unavailable", { status: 503 });
  }

  const feedEvents: FeedEventInput[] = [];
  for (const d of eventsSnap.docs) {
    const e = d.data() as CalendarEvent;
    const startAt = tsToDate(e.startAt);
    const endAt = tsToDate(e.endAt);
    if (!startAt || !endAt) continue;
    // The all-bookings feed labels each event with its assigned host; the
    // per-host feed doesn't (every event is already this member's).
    const baseSummary = e.title || "Booking";
    const summary =
      !hostMode && e.assignedToName
        ? `${baseSummary} — ${e.assignedToName}`
        : baseSummary;
    feedEvents.push({
      uid: d.id,
      startAt,
      endAt,
      summary,
      // Description carries the operator's notes (intake answers, etc.) so
      // they're visible inside the subscriber's calendar entry.
      description: e.notes || undefined,
      // Booking-page events: meetingUrl in LOCATION so Google/Apple
      // auto-detect the join link. Falls back to event.location (operator-
      // typed free-form text) when no meeting URL is set.
      location: e.meetingUrl || e.location || undefined,
      status: statusForIcs(eventStatus(e)),
      lastModified: tsToDate(e.updatedAt) ?? undefined,
    });
  }

  const domain = process.env.NEXT_PUBLIC_APP_URL
    ?.replace(/^https?:\/\//, "")
    ?.replace(/\/.*$/, "")
    ?.toLowerCase() ?? "leadstack.dev";

  const ics = generateIcsFeed({
    domain,
    calendarName,
    events: feedEvents,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // 5-minute cache on the CDN edge. Google polls ~every 8-24h
      // anyway, so this just deduplicates concurrent pollers + warms
      // for the operator's "test the URL in browser" check.
      "Cache-Control": "public, max-age=300, s-maxage=300",
      // Hint for clients that download rather than subscribe (e.g.
      // pasted into Apple Calendar's File → Import).
      "Content-Disposition": `inline; filename="calendar.ics"`,
    },
  });
}
