import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createEventServerSide } from "@/lib/server/events-service";

/**
 * Dashboard-facing calendar-event creation. Replaces the browser's direct
 * Firestore write so `event.created` fires through the shared service.
 * Event edits + deletes have no webhook event and stay client-side.
 *
 * Note: the booking system's events are minted by the booking routes (which
 * fire booking.created) — this collection-POST is only the manual calendar.
 */

function str(v: unknown, max = 5000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = str(body.subAccountId, 200);
  if (!subAccountId) {
    return NextResponse.json({ error: "subAccountId is required" }, { status: 400 });
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const title = str(body.title, 200);
  const startAt = parseDate(body.startAt);
  const endAt = parseDate(body.endAt);
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!startAt || !endAt) {
    return NextResponse.json(
      { error: "startAt and endAt are required ISO timestamps" },
      { status: 400 },
    );
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const { id, event } = await createEventServerSide({
    subAccountId,
    agencyId,
    createdByUid: access.uid,
    mode: "live",
    title,
    startAt,
    endAt,
    contactId: typeof body.contactId === "string" ? body.contactId : null,
    location: str(body.location),
    notes: str(body.notes),
    meetingUrl: typeof body.meetingUrl === "string" ? body.meetingUrl : null,
  });

  return NextResponse.json({ id, event }, { status: 201 });
}
