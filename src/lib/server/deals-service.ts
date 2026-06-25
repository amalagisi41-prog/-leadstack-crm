import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { fireWorkflowTrigger } from "@/lib/workflows/engine";
import {
  serializeDealForApi,
  type DealApiObject,
} from "@/lib/api/serializers/deals";
import { getStage, type DealPriority, type PipelineStageId } from "@/types/deals";
import type { WebhookEventType } from "@/types/webhooks";
import type { CustomFieldValue } from "@/types/custom-fields";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Server-side Deal write service — the single chokepoint where a deal is
 * created/moved/updated/deleted AND the matching webhook fires. Mirrors
 * `contacts-service.ts`; see that file's header for the why.
 *
 * Stage semantics match `PATCH /api/v1/deals/:id`: every write emits
 * `deal.updated`; a stage change additionally emits `deal.stage.changed`
 * plus the terminal-specific `deal.won` / `deal.lost`, and logs a
 * `pipeline_moved` activity on the contact's timeline.
 */

type Mode = "live" | "test";

/**
 * The contact fields embedded inline in every deal webhook payload, so
 * subscribers get the email/phone/name without a follow-up lookup. `null`
 * on the payload when the deal has no contact or it couldn't be read.
 */
export interface DealContactSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function summaryFromContactData(
  contactId: string,
  data: FirebaseFirestore.DocumentData,
): DealContactSummary {
  return {
    id: contactId,
    name: cleanStr(data.name),
    email: cleanStr(data.email),
    phone: cleanStr(data.phone),
  };
}

/**
 * Look up a deal's contact for the inline webhook summary. Returns null when
 * the deal has no contact or the contact can't be read.
 */
export async function fetchDealContactSummary(
  contactId: string | null | undefined,
): Promise<DealContactSummary | null> {
  if (!contactId) return null;
  try {
    const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
    if (!snap.exists) return null;
    return summaryFromContactData(contactId, snap.data()!);
  } catch {
    return null;
  }
}

/**
 * Fire one or more deal webhook events, enriching each payload with the
 * deal's contact summary (`contact: { id, name, email, phone } | null`).
 * Fire-and-forget: the contact is resolved ONCE and reused across every
 * event in this operation. Pass `contact` to skip the lookup (e.g. the
 * contact was already read, or has been deleted in a cascade).
 *
 * This is the single chokepoint for deal webhook emission — both the
 * dashboard service functions below and the public `/api/v1/deals` routes
 * call it, so every deal event carries the same enriched shape.
 */
export function emitDealEvents(opts: {
  subAccountId: string;
  agencyId: string;
  mode: Mode;
  deal: DealApiObject;
  events: { type: WebhookEventType; extra?: Record<string, unknown> }[];
  contact?: DealContactSummary | null;
}): void {
  void (async () => {
    try {
      const contact =
        opts.contact !== undefined
          ? opts.contact
          : await fetchDealContactSummary(opts.deal.contact_id);
      for (const e of opts.events) {
        await emitWebhookEvent({
          subAccountId: opts.subAccountId,
          agencyId: opts.agencyId,
          mode: opts.mode,
          type: e.type,
          payload: { deal: opts.deal, contact, ...(e.extra ?? {}) },
        });
      }
    } catch (err) {
      console.warn("[deals-service] emitDealEvents failed", err);
    }
  })();
}

/** Write a `pipeline_moved` activity to the contact's timeline (Admin SDK). */
async function writePipelineActivity(
  contactId: string,
  payload: {
    content: string;
    createdBy: string;
    meta: Record<string, unknown>;
  },
): Promise<void> {
  await getAdminDb()
    .collection("contacts")
    .doc(contactId)
    .collection("activities")
    .add({
      type: "pipeline_moved",
      content: payload.content,
      createdBy: payload.createdBy,
      meta: payload.meta,
      createdAt: FieldValue.serverTimestamp(),
    });
}

export interface CreateDealInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  mode: Mode;
  title: string;
  value: number;
  currency: string;
  contactId: string;
  stageId: PipelineStageId;
  priority: DealPriority;
  territoryId?: string | null;
  customFields?: Record<string, CustomFieldValue> | null;
}

export interface DealWriteResult {
  id: string;
  deal: DealApiObject;
}

/** Create a deal + log the create activity + emit `deal.created`. */
export async function createDealServerSide(
  input: CreateDealInput,
): Promise<DealWriteResult> {
  const db = getAdminDb();
  const ref = db.collection("deals").doc();

  const doc = {
    title: input.title,
    value: input.value,
    currency: input.currency,
    contactId: input.contactId,
    stageId: input.stageId,
    priority: input.priority,
    lostReason: null,
    customFields: input.customFields ?? {},
    territoryId: input.territoryId ?? GLOBAL_TERRITORY_ID,
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    createdByUid: input.createdByUid,
    mode: input.mode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    stageChangedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);

  await writePipelineActivity(input.contactId, {
    content: `Deal "${input.title}" created in ${getStage(input.stageId).label}`,
    createdBy: input.createdByUid,
    meta: { dealId: ref.id, toStageId: input.stageId },
  });

  const now = new Date();
  const deal = serializeDealForApi(
    ref.id,
    { ...doc, createdAt: now, updatedAt: now, stageChangedAt: now },
    input.mode,
  );

  emitDealEvents({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: input.mode,
    deal,
    events: [{ type: "deal.created" }],
  });

  return { id: ref.id, deal };
}

/**
 * Patch a deal. Handles plain field edits, contact re-home, and stage moves
 * in one call (the edit dialog sends all of them together; the Kanban drag
 * sends just `stageId` + optional `lostReason`).
 *
 * `userId` is stamped as the author of the move activity. Returns null when
 * the deal doesn't exist.
 */
export interface UpdateDealPatch {
  title?: string;
  value?: number;
  currency?: string;
  priority?: DealPriority;
  contactId?: string;
  territoryId?: string | null;
  stageId?: PipelineStageId;
  /** Only meaningful on a move to "lost". */
  lostReason?: string | null;
  /** "Completed" tick on a Won deal card. Stamps/clears `completedAt`. */
  completed?: boolean;
  /** Full replacement of the custom-field value map (validated by the route). */
  customFields?: Record<string, CustomFieldValue> | null;
}

export async function updateDealServerSide(opts: {
  dealId: string;
  patch: UpdateDealPatch;
  userId: string;
  mode?: Mode;
}): Promise<DealWriteResult | null> {
  const db = getAdminDb();
  const ref = db.doc(`deals/${opts.dealId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const existing = snap.data()!;
  const mode = opts.mode ?? (existing.mode as Mode) ?? "live";
  const previousStage = existing.stageId as PipelineStageId | undefined;
  const { patch } = opts;

  const write: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.title !== undefined) write.title = patch.title;
  if (patch.value !== undefined) write.value = patch.value;
  if (patch.currency !== undefined) write.currency = patch.currency;
  if (patch.priority !== undefined) write.priority = patch.priority;
  if (patch.contactId !== undefined) write.contactId = patch.contactId;
  if (patch.territoryId !== undefined) write.territoryId = patch.territoryId;
  if (patch.customFields !== undefined) write.customFields = patch.customFields;
  if (patch.completed !== undefined) {
    write.completed = patch.completed;
    write.completedAt = patch.completed ? FieldValue.serverTimestamp() : null;
  }

  const stageChanged =
    patch.stageId !== undefined && patch.stageId !== previousStage;
  if (patch.stageId !== undefined) {
    write.stageId = patch.stageId;
    if (stageChanged) {
      write.stageChangedAt = FieldValue.serverTimestamp();
      // Mirror the old client `moveDeal`: set the reason moving INTO lost,
      // clear it moving back OUT of lost.
      if (patch.stageId === "lost") {
        write.lostReason = patch.lostReason?.trim() || null;
      } else if (previousStage === "lost") {
        write.lostReason = null;
      }
    }
  }

  await ref.set(write, { merge: true });

  const fresh = await ref.get();
  const data = fresh.data()!;
  const deal = serializeDealForApi(fresh.id, data, mode);

  if (stageChanged && previousStage) {
    const reasonSuffix =
      patch.stageId === "lost" && write.lostReason
        ? ` — ${write.lostReason as string}`
        : "";
    await writePipelineActivity(data.contactId, {
      content: `Deal "${data.title}" moved from ${getStage(previousStage).label} to ${getStage(patch.stageId!).label}${reasonSuffix}`,
      createdBy: opts.userId,
      meta: {
        dealId: fresh.id,
        fromStageId: previousStage,
        toStageId: patch.stageId,
      },
    });
  }

  // Always emit deal.updated; a stage move layers the finer events on top.
  const events: { type: WebhookEventType; extra?: Record<string, unknown> }[] =
    [{ type: "deal.updated" }];
  if (stageChanged) {
    events.push({
      type: "deal.stage.changed",
      extra: { previous_stage: previousStage ?? null },
    });
    if (patch.stageId === "won") events.push({ type: "deal.won" });
    else if (patch.stageId === "lost") events.push({ type: "deal.lost" });
  }
  emitDealEvents({
    subAccountId: existing.subAccountId,
    agencyId: existing.agencyId,
    mode,
    deal,
    events,
  });

  // Workflow trigger — a stage move enrolls the deal's contact (workflow runs
  // are contact-scoped). `toStage` lets a workflow narrow to one target stage.
  if (mode === "live" && stageChanged && data.contactId) {
    void fireWorkflowTrigger({
      subAccountId: existing.subAccountId as string,
      agencyId: existing.agencyId as string,
      type: "pipeline.stage.changed",
      contactId: data.contactId as string,
      context: { toStage: patch.stageId },
    });
  }

  return { id: fresh.id, deal };
}

/**
 * Delete a deal + emit `deal.deleted` (serialized from the pre-delete
 * snapshot). Returns false when the deal didn't exist.
 */
export async function deleteDealServerSide(opts: {
  dealId: string;
  mode?: Mode;
}): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.doc(`deals/${opts.dealId}`);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data()!;
  const mode = opts.mode ?? (data.mode as Mode) ?? "live";
  const deal = serializeDealForApi(snap.id, data, mode);

  await ref.delete();

  emitDealEvents({
    subAccountId: data.subAccountId,
    agencyId: data.agencyId,
    mode,
    deal,
    events: [{ type: "deal.deleted" }],
  });
  return true;
}

/**
 * Emit `deal.deleted` from a pre-delete snapshot. Used by paths that delete
 * a deal outside `deleteDealServerSide` — the contact-delete cascade (which
 * batch-deletes a contact's deals) and the public API's deal DELETE.
 */
export function emitDealDeleted(opts: {
  subAccountId: string;
  agencyId: string;
  dealId: string;
  data: FirebaseFirestore.DocumentData;
  mode?: Mode;
  /**
   * Pre-read contact doc data. The contact-delete cascade deletes the
   * contact BEFORE this fires, so a fresh lookup would miss it — pass the
   * contact data the route already read. Omit to look the contact up.
   */
  contactData?: FirebaseFirestore.DocumentData | null;
}): void {
  const mode = opts.mode ?? (opts.data.mode as Mode) ?? "live";
  const deal = serializeDealForApi(opts.dealId, opts.data, mode);
  const contactId = opts.data.contactId as string | null | undefined;
  const contact =
    opts.contactData !== undefined
      ? contactId
        ? summaryFromContactData(contactId, opts.contactData ?? {})
        : null
      : undefined;
  emitDealEvents({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    mode,
    deal,
    events: [{ type: "deal.deleted" }],
    contact,
  });
}

/**
 * Emit `deal.created` for a deal already written elsewhere (the public form
 * submit creates a deal inline). Self-guarded so it's safe to `void`.
 */
export async function emitDealCreatedById(opts: {
  subAccountId: string;
  agencyId: string;
  dealId: string;
  mode?: Mode;
}): Promise<void> {
  try {
    const snap = await getAdminDb().doc(`deals/${opts.dealId}`).get();
    if (!snap.exists) return;
    const mode = opts.mode ?? (snap.data()!.mode as Mode) ?? "live";
    const deal = serializeDealForApi(snap.id, snap.data()!, mode);
    emitDealEvents({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      mode,
      deal,
      events: [{ type: "deal.created" }],
    });
  } catch (err) {
    console.warn("[deals-service] emitDealCreatedById failed", err);
  }
}
