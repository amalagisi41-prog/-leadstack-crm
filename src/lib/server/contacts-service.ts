import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { fireWorkflowTrigger } from "@/lib/workflows/engine";
import {
  serializeContactForApi,
  type ContactApiObject,
} from "@/lib/api/serializers/contacts";
import type { ContactAttribution } from "@/types/contacts";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Server-side Contact write service — the single chokepoint where a contact
 * is created/updated AND the matching webhook fires.
 *
 * Why this exists: the dashboard used to write contacts straight from the
 * browser via the client Firestore SDK, so no server code ran and no
 * `contact.created` webhook fired. Every dashboard write now POSTs to a
 * thin route that calls into here (Admin SDK), so a contact born in the UI
 * fires the same event as one created through `POST /api/v1/contacts`.
 *
 * Firing is free when nobody's listening: `emitWebhookEvent` early-returns
 * after one subscription lookup when no active subscription matches the
 * event type + mode, so these helpers are safe to call on every write.
 */

type Mode = "live" | "test";

/**
 * Fields a caller may set when creating a contact. Superset of the
 * dashboard `ContactFormData` and the public-API `ContactCreateInput`, so
 * both entry points share one write path. Everything past `tags` is
 * optional and defaults to the same values the old client/admin writes used.
 */
export interface CreateContactInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  mode: Mode;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  source: string;
  tags: string[];
  pipelineStage?: string | null;
  territoryId?: string | null;
  attribution?: ContactAttribution | null;
  /** Optional resolved location (form submit supplies this; UI doesn't). */
  location?: {
    countryCode: string | null;
    country: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
}

export interface ContactWriteResult {
  id: string;
  contact: ContactApiObject;
}

/**
 * Create a contact + emit `contact.created`. Returns the new id and the
 * serialized wire object (handy for the API response). The webhook is
 * fire-and-forget — the write never blocks on dispatch.
 */
export async function createContactServerSide(
  input: CreateContactInput,
): Promise<ContactWriteResult> {
  const db = getAdminDb();
  const ref = db.collection("contacts").doc();
  const loc = input.location ?? null;

  const doc = {
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    address: input.address,
    source: input.source,
    tags: input.tags,
    pipelineStage: input.pipelineStage ?? null,
    attribution: input.attribution ?? null,
    emailOptedOut: false,
    smsOptedOut: false,
    countryCode: loc?.countryCode ?? null,
    country: loc?.country ?? null,
    city: loc?.city ?? null,
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
    territoryId: input.territoryId ?? GLOBAL_TERRITORY_ID,
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    createdByUid: input.createdByUid,
    mode: input.mode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);

  // Serialize from the in-memory doc with a JS `now` for the timestamps
  // (the serverTimestamp sentinels aren't readable without a re-read, and a
  // sub-millisecond drift on created_at is immaterial to subscribers).
  const now = new Date();
  const contact = serializeContactForApi(
    ref.id,
    { ...doc, createdAt: now, updatedAt: now },
    input.mode,
  );

  void emitWebhookEvent({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: input.mode,
    type: "contact.created",
    payload: { contact },
  });
  if (input.mode === "live") {
    void fireWorkflowTrigger({
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      type: "contact.created",
      contactId: ref.id,
    });
  }

  return { id: ref.id, contact };
}

/** Fields that can be patched. All optional; only provided keys are written. */
export interface UpdateContactPatch {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  source?: string;
  tags?: string[];
  pipelineStage?: string | null;
}

/**
 * Update a contact + emit `contact.updated`. Reads the doc back so the
 * webhook payload + return value reflect the merged state. Returns null when
 * the contact doesn't exist.
 *
 * `territoryId` is intentionally NOT handled here — moving a contact's
 * territory fans out to its deals/quotes/tasks/events via a dedicated
 * admin endpoint, so callers route that change separately.
 */
export async function updateContactServerSide(opts: {
  contactId: string;
  patch: UpdateContactPatch;
  /** The contact's mode (from the existing doc); defaults to live. */
  mode?: Mode;
}): Promise<ContactWriteResult | null> {
  const db = getAdminDb();
  const ref = db.doc(`contacts/${opts.contactId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const existing = snap.data()!;
  const mode = opts.mode ?? (existing.mode as Mode) ?? "live";

  await ref.set(
    { ...opts.patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  const fresh = await ref.get();
  const contact = serializeContactForApi(fresh.id, fresh.data()!, mode);

  void emitWebhookEvent({
    subAccountId: existing.subAccountId,
    agencyId: existing.agencyId,
    mode,
    type: "contact.updated",
    payload: { contact },
  });
  // contact.tag.added fires once per update when the patch introduces a new
  // tag (replace-semantics patch → diff against the pre-update tags).
  if (mode === "live" && opts.patch.tags) {
    const oldTags: string[] = Array.isArray(existing.tags) ? existing.tags : [];
    const added = opts.patch.tags.filter((t) => !oldTags.includes(t));
    if (added.length > 0) {
      void fireWorkflowTrigger({
        subAccountId: existing.subAccountId,
        agencyId: existing.agencyId,
        type: "contact.tag.added",
        contactId: opts.contactId,
        context: { addedTags: added },
      });
    }
  }

  return { id: ref.id, contact };
}

/**
 * Emit `contact.created` for a contact that was ALREADY written elsewhere
 * (public form submit, web-chat / voice capture, booking reconcile). Reads
 * the doc, serializes it, fires the event. Self-guarded so it's safe to
 * `void` from any write path — a read blip can never break the originating
 * request.
 */
export async function emitContactCreatedById(opts: {
  subAccountId: string;
  agencyId: string;
  contactId: string;
  mode?: Mode;
}): Promise<void> {
  try {
    const snap = await getAdminDb().doc(`contacts/${opts.contactId}`).get();
    if (!snap.exists) return;
    const mode = opts.mode ?? (snap.data()!.mode as Mode) ?? "live";
    const contact = serializeContactForApi(snap.id, snap.data()!, mode);
    await emitWebhookEvent({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      mode,
      type: "contact.created",
      payload: { contact },
    });
    if (mode === "live") {
      void fireWorkflowTrigger({
        subAccountId: opts.subAccountId,
        agencyId: opts.agencyId,
        type: "contact.created",
        contactId: opts.contactId,
      });
    }
  } catch (err) {
    console.warn("[contacts-service] emitContactCreatedById failed", err);
  }
}

/**
 * Emit `contact.deleted`. Called from the contact DELETE route, which has
 * already read the doc (the contact is gone by the time subscribers react,
 * so we serialize from the pre-delete snapshot data).
 */
export function emitContactDeleted(opts: {
  subAccountId: string;
  agencyId: string;
  contactId: string;
  data: FirebaseFirestore.DocumentData;
  mode?: Mode;
}): void {
  const mode = opts.mode ?? (opts.data.mode as Mode) ?? "live";
  const contact = serializeContactForApi(opts.contactId, opts.data, mode);
  void emitWebhookEvent({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    mode,
    type: "contact.deleted",
    payload: { contact },
  });
}
