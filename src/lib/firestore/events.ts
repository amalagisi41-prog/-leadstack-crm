import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { addActivity } from "@/lib/firestore/activities";
import { territoryIdForContact } from "@/lib/firestore/territory-inherit";
import {
  NOOP_UNSUB,
  territoryQueryPlan,
} from "@/lib/firestore/territory-query";
import type { CalendarEvent, EventFormData } from "@/types/events";
import { GLOBAL_TERRITORY_ID, type TenantScope } from "@/types";

const EVENTS = "events";

export interface EventQueryOptions {
  /** Territory filter for scoped collaborators. `null` (default) = no
   *  filter. See deals.ts for the full contract. */
  territoryFilter?: string[] | null;
}

export function subscribeToEvents(
  scope: TenantScope,
  callback: (events: CalendarEvent[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe;
export function subscribeToEvents(
  scope: TenantScope,
  opts: EventQueryOptions,
  callback: (events: CalendarEvent[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe;
export function subscribeToEvents(
  scope: TenantScope,
  callbackOrOpts: ((events: CalendarEvent[]) => void) | EventQueryOptions,
  callbackOrError?:
    | ((events: CalendarEvent[]) => void)
    | ((err: Error) => void),
  onErrorMaybe?: (err: Error) => void,
): Unsubscribe {
  const opts: EventQueryOptions =
    typeof callbackOrOpts === "function" ? {} : callbackOrOpts;
  const callback: (events: CalendarEvent[]) => void =
    typeof callbackOrOpts === "function"
      ? callbackOrOpts
      : (callbackOrError as (events: CalendarEvent[]) => void);
  const onError: ((err: Error) => void) | undefined =
    typeof callbackOrOpts === "function"
      ? (callbackOrError as ((err: Error) => void) | undefined)
      : onErrorMaybe;

  const plan = territoryQueryPlan(opts.territoryFilter);
  if (plan.mode === "empty") {
    callback([]);
    return NOOP_UNSUB;
  }
  const constraints: QueryConstraint[] = [
    where("subAccountId", "==", scope.subAccountId),
  ];
  if (plan.mode === "in") constraints.push(plan.constraint);
  const q = query(collection(getFirebaseDb(), EVENTS), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const events = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<CalendarEvent, "id">) }),
      );
      events.sort((a, b) => toMillis(a.startAt) - toMillis(b.startAt));
      callback(events);
    },
    (err) => onError?.(err),
  );
}

export async function createEvent(
  scope: TenantScope,
  createdByUid: string,
  data: EventFormData,
): Promise<string> {
  const territoryId =
    (await territoryIdForContact(data.contactId)) ?? GLOBAL_TERRITORY_ID;
  const ref = await addDoc(collection(getFirebaseDb(), EVENTS), {
    title: data.title,
    startAt: Timestamp.fromDate(data.startAt),
    endAt: Timestamp.fromDate(data.endAt),
    contactId: data.contactId,
    location: data.location,
    notes: data.notes,
    meetingUrl: data.meetingUrl ?? null,
    agencyId: scope.agencyId,
    subAccountId: scope.subAccountId,
    createdByUid,
    territoryId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (data.contactId) {
    await addActivity(data.contactId, {
      type: "booking_created",
      createdBy: createdByUid,
      content: `Event "${data.title}" scheduled for ${formatShort(data.startAt)}`,
      meta: { bookingId: ref.id },
    });
  }
  return ref.id;
}

export async function updateEvent(
  id: string,
  data: Partial<EventFormData>,
): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.title !== undefined) patch.title = data.title;
  if (data.startAt !== undefined)
    patch.startAt = Timestamp.fromDate(data.startAt);
  if (data.endAt !== undefined) patch.endAt = Timestamp.fromDate(data.endAt);
  if (data.contactId !== undefined) {
    patch.contactId = data.contactId;
    // Re-derive territory when the linked contact changes so the event
    // follows the new account's territory (Global when unlinked).
    patch.territoryId =
      (await territoryIdForContact(data.contactId)) ?? GLOBAL_TERRITORY_ID;
  }
  if (data.location !== undefined) patch.location = data.location;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.meetingUrl !== undefined) patch.meetingUrl = data.meetingUrl;
  await updateDoc(doc(getFirebaseDb(), EVENTS, id), patch);
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), EVENTS, id));
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}

function formatShort(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
