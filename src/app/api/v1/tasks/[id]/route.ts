import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { withApiAuth } from "@/lib/api/auth";
import { apiError, apiOk } from "@/lib/api/responses";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  parseTaskPatch,
  serializeTaskForApi,
} from "@/lib/api/serializers/tasks";

export const GET = withApiAuth<{ id: string }>(async ({ params, ctx }) => {
  const snap = await getAdminDb().doc(`tasks/${params.id}`).get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "task_not_found", "Task not found.");
  }
  const d = snap.data()!;
  if (d.subAccountId !== ctx.subAccountId || d.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "task_not_found", "Task not found.");
  }
  return apiOk(ctx, { task: serializeTaskForApi(snap.id, d, ctx.mode) });
});

export const PATCH = withApiAuth<{ id: string }>(async ({ body, params, ctx }) => {
  const parsed = parseTaskPatch(body);
  if (!parsed.ok) {
    return apiError(ctx, "invalid_request", "invalid_body", parsed.error!);
  }
  const patch = parsed.value!;
  const ref = getAdminDb().doc(`tasks/${params.id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "task_not_found", "Task not found.");
  }
  const existing = snap.data()!;
  if (existing.subAccountId !== ctx.subAccountId || existing.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "task_not_found", "Task not found.");
  }

  const wasCompleted = !!existing.completed;
  const writePatch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.title !== undefined) writePatch.title = patch.title;
  if (patch.notes !== undefined) writePatch.notes = patch.notes;
  if (patch.dueAt !== undefined) writePatch.dueAt = patch.dueAt;
  if (patch.contactId !== undefined) writePatch.contactId = patch.contactId;
  if (patch.dealId !== undefined) writePatch.dealId = patch.dealId;
  if (patch.eventId !== undefined) writePatch.eventId = patch.eventId;

  let firedCompleted = false;
  if (patch.completed !== undefined) {
    writePatch.completed = patch.completed;
    if (patch.completed && !wasCompleted) {
      writePatch.completedAt = FieldValue.serverTimestamp();
      firedCompleted = true;
    } else if (!patch.completed && wasCompleted) {
      writePatch.completedAt = null;
    }
  }

  await ref.set(writePatch, { merge: true });
  const fresh = await ref.get();
  const wire = serializeTaskForApi(fresh.id, fresh.data()!, ctx.mode);

  if (firedCompleted) {
    void emitWebhookEvent({
      subAccountId: ctx.subAccountId,
      agencyId: ctx.agencyId,
      mode: ctx.mode,
      type: "task.completed",
      payload: { task: wire },
    });
  }
  return apiOk(ctx, { task: wire });
});

export const DELETE = withApiAuth<{ id: string }>(async ({ params, ctx }) => {
  const ref = getAdminDb().doc(`tasks/${params.id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "task_not_found", "Task not found.");
  }
  const d = snap.data()!;
  if (d.subAccountId !== ctx.subAccountId || d.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "task_not_found", "Task not found.");
  }
  await ref.delete();
  return apiOk(ctx, { id: params.id, object: "task", deleted: true });
});
