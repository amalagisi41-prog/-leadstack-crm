import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  serializeEventForApi,
  type EventApiObject,
} from "@/lib/api/serializers/events";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Server-side calendar-event create — fires `event.created` from the
 * dashboard calendar (it used to be a direct client Firestore write).
 * Event edits + deletes have no webhook event, so they stay client-side.
 * Booking-page events go through the booking lifecycle (booking.created),
 * not this path.
 */

type Mode = "live" | "test";

async function territoryForContact(contactId: string | null): Promise<string> {
  if (!contactId) return GLOBAL_TERRITORY_ID;
  try {
    const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
    const raw = snap.data()?.territoryId;
    return typeof raw === "string" ? raw : GLOBAL_TERRITORY_ID;
  } catch {
    return GLOBAL_TERRITORY_ID;
  }
}

function formatShort(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface CreateEventInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  mode: Mode;
  title: string;
  startAt: Date;
  endAt: Date;
  contactId: string | null;
  location: string;
  notes: string;
  meetingUrl?: string | null;
}

export interface EventWriteResult {
  id: string;
  event: EventApiObject;
}

/** Create a manual calendar event + activity row + emit `event.created`. */
export async function createEventServerSide(
  input: CreateEventInput,
): Promise<EventWriteResult> {
  const db = getAdminDb();
  const territoryId = await territoryForContact(input.contactId);
  const ref = db.collection("events").doc();

  const doc = {
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    contactId: input.contactId,
    location: input.location,
    notes: input.notes,
    meetingUrl: input.meetingUrl ?? null,
    status: "scheduled",
    source: "manual",
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    createdByUid: input.createdByUid,
    territoryId,
    mode: input.mode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);

  // Mirror the client's activity write so the contact timeline is unchanged.
  if (input.contactId) {
    try {
      await db
        .collection("contacts")
        .doc(input.contactId)
        .collection("activities")
        .add({
          type: "booking_created",
          createdBy: input.createdByUid,
          content: `Event "${input.title}" scheduled for ${formatShort(input.startAt)}`,
          meta: { bookingId: ref.id },
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.warn("[events-service] activity write failed", err);
    }
  }

  const now = new Date();
  const event = serializeEventForApi(
    ref.id,
    { ...doc, createdAt: now, updatedAt: now },
    input.mode,
  );

  void emitWebhookEvent({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: input.mode,
    type: "event.created",
    payload: { event },
  });

  return { id: ref.id, event };
}
