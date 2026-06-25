import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { eventOccupiesSlot, eventSource, eventStatus } from "@/types/events";
import type { CalendarEvent } from "@/types/events";
import type { BookingPage } from "@/types/booking";
import type { SubAccountMemberDoc } from "@/types/tenancy";
import type { ActivityType } from "@/types/contacts";

/**
 * Reassign a team booking to a different host.
 *
 *   POST /api/events/by-id/[id]/assign
 *   body: { assignedToUid: string | null, force?: boolean }
 *
 * Booking-page events only. Allowed for a sub-account admin (incl. agency
 * owner) OR the current assignee. The target must be an active member and —
 * when the page still lists hosts — one of the page's configured hosts. A
 * soft conflict check warns when the target already has an overlapping
 * booking; pass `force: true` to proceed anyway.
 *
 * Updates `assignedToUid` / `assignedToName`, logs a `booking_reassigned`
 * activity, and (via `assignedToUid`) flows into the calendar host pill, the
 * .ics feeds, and the per-host "just my bookings" feed automatically. Customer
 * emails are not touched — assignment stays internal, same as auto-assign.
 */

interface Body {
  assignedToUid?: string | null;
  force?: boolean;
}

function tsToDate(v: unknown): Date | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  return d instanceof Date ? d : null;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await ctx.params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const targetUid =
    typeof body.assignedToUid === "string" && body.assignedToUid.trim()
      ? body.assignedToUid.trim()
      : null;
  const force = body.force === true;

  const db = getAdminDb();
  const eventRef = db.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = eventSnap.data() as CalendarEvent;

  const access = await requireSubAccountMember(request, event.subAccountId);
  if (access instanceof NextResponse) return access;

  if (eventSource(event) !== "booking_page") {
    return NextResponse.json(
      { error: "Only booking-page events can be reassigned." },
      { status: 400 },
    );
  }

  // Permission: admin (incl. agency owner) OR the current assignee.
  const isAdmin =
    access.subAccountRole === "admin" ||
    access.subAccountRole === "agencyOwner";
  const isAssignee =
    !!event.assignedToUid && event.assignedToUid === access.uid;
  if (!isAdmin && !isAssignee) {
    return NextResponse.json(
      {
        error: "Only an admin or the current host can reassign this booking.",
      },
      { status: 403 },
    );
  }

  // No change requested.
  if ((event.assignedToUid ?? null) === targetUid) {
    return NextResponse.json({
      ok: true,
      noop: true,
      assignedToUid: targetUid,
      assignedToName: event.assignedToName ?? null,
    });
  }

  let targetName: string | null = null;

  if (targetUid) {
    // When the page still lists hosts, the target must be one of them.
    if (event.bookingPageSlug) {
      const pageSnap = await db
        .doc(
          `subAccounts/${event.subAccountId}/bookingPages/${event.bookingPageSlug}`,
        )
        .get();
      const page = pageSnap.exists ? (pageSnap.data() as BookingPage) : null;
      const hosts = page?.hosts ?? [];
      if (hosts.length > 0 && !hosts.some((h) => h.uid === targetUid)) {
        return NextResponse.json(
          { error: "That person isn't a host on this booking page." },
          { status: 400 },
        );
      }
    }

    // Must be an active member; snapshot a fresh display name.
    const memberSnap = await db
      .doc(`subAccounts/${event.subAccountId}/subAccountMembers/${targetUid}`)
      .get();
    const member = memberSnap.exists
      ? (memberSnap.data() as SubAccountMemberDoc)
      : null;
    if (!member || member.status !== "active") {
      return NextResponse.json(
        { error: "That member isn't active on this sub-account." },
        { status: 400 },
      );
    }
    targetName = (member.displayName || member.email || "Host").slice(0, 120);

    // Soft conflict check (skipped with force). Uses the
    // events(subAccountId, assignedToUid, startAt) composite index.
    const start = tsToDate(event.startAt);
    const end = tsToDate(event.endAt);
    if (!force && start && end) {
      try {
        const lookbackMs = 8 * 60 * 60_000;
        const snap = await db
          .collection("events")
          .where("subAccountId", "==", event.subAccountId)
          .where("assignedToUid", "==", targetUid)
          .where(
            "startAt",
            ">=",
            Timestamp.fromDate(new Date(start.getTime() - lookbackMs)),
          )
          .where("startAt", "<=", Timestamp.fromDate(new Date(end.getTime() + 1000)))
          .get();
        const clash = snap.docs.some((d) => {
          if (d.id === eventId) return false;
          const e = d.data() as CalendarEvent;
          if (!eventOccupiesSlot(eventStatus(e))) return false;
          const s = tsToDate(e.startAt);
          const en = tsToDate(e.endAt);
          if (!s || !en) return false;
          // [s, en) overlaps [start, end)
          return s.getTime() < end.getTime() && en.getTime() > start.getTime();
        });
        if (clash) {
          return NextResponse.json({
            ok: false,
            needsConfirm: true,
            warning: `${targetName} already has a booking that overlaps this time.`,
          });
        }
      } catch (err) {
        // Index missing / query failed → don't block the reassignment; just
        // skip the warning (the operator's deliberate action still goes through).
        console.warn(
          `[events/assign] conflict check failed event=${eventId}`,
          err,
        );
      }
    }
  }

  try {
    await eventRef.update({
      assignedToUid: targetUid,
      assignedToName: targetName,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`[events/assign] update failed event=${eventId}`, err);
    return NextResponse.json({ error: "Couldn't reassign." }, { status: 500 });
  }

  // Timeline row (best-effort).
  if (event.contactId) {
    try {
      const content = targetName
        ? `Booking "${event.title || "Meeting"}" reassigned to ${targetName}.`
        : `Booking "${event.title || "Meeting"}" host cleared.`;
      await db
        .collection("contacts")
        .doc(event.contactId)
        .collection("activities")
        .add({
          type: "booking_reassigned" satisfies ActivityType,
          content,
          createdBy: access.uid,
          meta: { eventId, assignedToUid: targetUid ?? undefined },
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.warn(`[events/assign] activity write failed event=${eventId}`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    assignedToUid: targetUid,
    assignedToName: targetName,
  });
}
