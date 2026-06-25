import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  serializeTaskForApi,
  type TaskApiObject,
} from "@/lib/api/serializers/tasks";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Server-side Task write service — create + complete go through here so
 * `task.created` / `task.completed` fire from the dashboard, not just the
 * public API. Plain edits + deletes have no webhook event, so they stay as
 * client-side Firestore writes.
 */

type Mode = "live" | "test";

/** Territory follows the linked contact; standalone tasks fall back to Global. */
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

export interface CreateTaskInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  mode: Mode;
  title: string;
  notes: string;
  dueAt: Date | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
}

export interface TaskWriteResult {
  id: string;
  task: TaskApiObject;
}

/** Create a task + emit `task.created`. */
export async function createTaskServerSide(
  input: CreateTaskInput,
): Promise<TaskWriteResult> {
  const db = getAdminDb();
  const territoryId = await territoryForContact(input.contactId);
  const ref = db.collection("tasks").doc();

  const doc = {
    title: input.title,
    notes: input.notes,
    dueAt: input.dueAt,
    completed: false,
    completedAt: null,
    contactId: input.contactId,
    dealId: input.dealId,
    eventId: input.eventId,
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    createdByUid: input.createdByUid,
    territoryId,
    mode: input.mode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);

  const now = new Date();
  const task = serializeTaskForApi(
    ref.id,
    { ...doc, createdAt: now, updatedAt: now },
    input.mode,
  );

  void emitWebhookEvent({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: input.mode,
    type: "task.created",
    payload: { task },
  });

  return { id: ref.id, task };
}

/**
 * Flip a task's completed flag. Emits `task.completed` only on the
 * false→true edge (matches the public API), and writes the
 * `task_completed` activity on the linked contact. Returns null when the
 * task doesn't exist.
 */
export async function setTaskCompletedServerSide(opts: {
  taskId: string;
  completed: boolean;
  userId: string;
  mode?: Mode;
}): Promise<TaskWriteResult | null> {
  const db = getAdminDb();
  const ref = db.doc(`tasks/${opts.taskId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const existing = snap.data()!;
  const mode = opts.mode ?? (existing.mode as Mode) ?? "live";
  const wasCompleted = !!existing.completed;

  await ref.set(
    {
      completed: opts.completed,
      completedAt: opts.completed ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const justCompleted = opts.completed && !wasCompleted;
  if (justCompleted && existing.contactId) {
    try {
      await db
        .collection("contacts")
        .doc(existing.contactId as string)
        .collection("activities")
        .add({
          type: "task_completed",
          createdBy: opts.userId,
          content: `Task completed: "${existing.title ?? ""}"`,
          meta: {},
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.warn("[tasks-service] task_completed activity failed", err);
    }
  }

  const fresh = await ref.get();
  const task = serializeTaskForApi(fresh.id, fresh.data()!, mode);

  if (justCompleted) {
    void emitWebhookEvent({
      subAccountId: existing.subAccountId,
      agencyId: existing.agencyId,
      mode,
      type: "task.completed",
      payload: { task },
    });
  }

  return { id: fresh.id, task };
}
