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
import type { Task, TaskFormData } from "@/types/tasks";
import { GLOBAL_TERRITORY_ID, type TenantScope } from "@/types";

const TASKS = "tasks";

export interface TaskQueryOptions {
  /** Territory filter for scoped collaborators. See deals.ts for the
   *  full contract. `null` (default) = no filter. */
  territoryFilter?: string[] | null;
}

function dueToPatch(data: Partial<TaskFormData>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.dueAt !== undefined)
    patch.dueAt = data.dueAt ? Timestamp.fromDate(data.dueAt) : null;
  if (data.contactId !== undefined) patch.contactId = data.contactId;
  if (data.dealId !== undefined) patch.dealId = data.dealId;
  if (data.eventId !== undefined) patch.eventId = data.eventId;
  return patch;
}

async function patchWithTerritory(
  data: Partial<TaskFormData>,
): Promise<Record<string, unknown>> {
  const patch = dueToPatch(data);
  // Re-derive territory when the linked contact changes so the task
  // follows the new account's territory (Global when unlinked).
  if (data.contactId !== undefined) {
    patch.territoryId =
      (await territoryIdForContact(data.contactId)) ?? GLOBAL_TERRITORY_ID;
  }
  return patch;
}

export function subscribeToTasks(
  scope: TenantScope,
  callback: (tasks: Task[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe;
export function subscribeToTasks(
  scope: TenantScope,
  opts: TaskQueryOptions,
  callback: (tasks: Task[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe;
export function subscribeToTasks(
  scope: TenantScope,
  callbackOrOpts: ((tasks: Task[]) => void) | TaskQueryOptions,
  callbackOrError?: ((tasks: Task[]) => void) | ((err: Error) => void),
  onErrorMaybe?: (err: Error) => void,
): Unsubscribe {
  const opts: TaskQueryOptions =
    typeof callbackOrOpts === "function" ? {} : callbackOrOpts;
  const callback: (tasks: Task[]) => void =
    typeof callbackOrOpts === "function"
      ? callbackOrOpts
      : (callbackOrError as (tasks: Task[]) => void);
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
  const q = query(collection(getFirebaseDb(), TASKS), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const tasks = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<Task, "id">) }),
      );
      tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const da = toMillis(a.dueAt);
        const db = toMillis(b.dueAt);
        if (!da && !db) return toMillis(b.createdAt) - toMillis(a.createdAt);
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      });
      callback(tasks);
    },
    (err) => onError?.(err),
  );
}

export function subscribeToTasksForContact(
  contactId: string,
  scope: TenantScope,
  callback: (tasks: Task[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), TASKS),
    where("subAccountId", "==", scope.subAccountId),
    where("contactId", "==", contactId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const tasks = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<Task, "id">) }),
      );
      tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return toMillis(a.dueAt) - toMillis(b.dueAt);
      });
      callback(tasks);
    },
    (err) => onError?.(err),
  );
}

export async function createTask(
  scope: TenantScope,
  createdByUid: string,
  data: TaskFormData,
): Promise<string> {
  // Inherit territory from the linked contact (the account owns the
  // territory). Standalone tasks (no contact) fall back to Global.
  const territoryId =
    (await territoryIdForContact(data.contactId)) ?? GLOBAL_TERRITORY_ID;
  const ref = await addDoc(collection(getFirebaseDb(), TASKS), {
    title: data.title,
    notes: data.notes,
    dueAt: data.dueAt ? Timestamp.fromDate(data.dueAt) : null,
    completed: false,
    completedAt: null,
    contactId: data.contactId,
    dealId: data.dealId,
    eventId: data.eventId,
    agencyId: scope.agencyId,
    subAccountId: scope.subAccountId,
    createdByUid,
    territoryId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeToTask(
  id: string,
  callback: (task: Task | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), TASKS, id),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<Task, "id">) });
    },
    (err) => onError?.(err),
  );
}

export async function updateTask(
  id: string,
  data: Partial<TaskFormData>,
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), TASKS, id), {
    ...(await patchWithTerritory(data)),
    updatedAt: serverTimestamp(),
  });
}

export async function setTaskCompleted(
  task: Task,
  completed: boolean,
  userId: string,
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), TASKS, task.id), {
    completed,
    completedAt: completed ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
  if (completed && task.contactId) {
    await addActivity(task.contactId, {
      type: "task_completed",
      createdBy: userId,
      content: `Task completed: "${task.title}"`,
      meta: {},
    });
  }
}

export async function deleteTask(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), TASKS, id));
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
