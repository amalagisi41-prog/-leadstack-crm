import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { withApiAuth } from "@/lib/api/auth";
import { apiError, apiOk } from "@/lib/api/responses";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  parseEventPatch,
  serializeEventForApi,
} from "@/lib/api/serializers/events";

export const GET = withApiAuth<{ id: string }>(async ({ params, ctx }) => {
  const snap = await getAdminDb().doc(`events/${params.id}`).get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "event_not_found", "Event not found.");
  }
  const d = snap.data()!;
  if (d.subAccountId !== ctx.subAccountId || d.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "event_not_found", "Event not found.");
  }
  return apiOk(ctx, { event: serializeEventForApi(snap.id, d, ctx.mode) });
});

export const PATCH = withApiAuth<{ id: string }>(async ({ body, params, ctx }) => {
  const parsed = parseEventPatch(body);
  if (!parsed.ok) {
    return apiError(ctx, "invalid_request", "invalid_body", parsed.error!);
  }
  const patch = parsed.value!;
  const ref = getAdminDb().doc(`events/${params.id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "event_not_found", "Event not found.");
  }
  const existing = snap.data()!;
  if (existing.subAccountId !== ctx.subAccountId || existing.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "event_not_found", "Event not found.");
  }

  const writePatch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.title !== undefined) writePatch.title = patch.title;
  if (patch.startAt !== undefined) writePatch.startAt = patch.startAt;
  if (patch.endAt !== undefined) writePatch.endAt = patch.endAt;
  if (patch.contactId !== undefined) writePatch.contactId = patch.contactId;
  if (patch.location !== undefined) writePatch.location = patch.location;
  if (patch.notes !== undefined) writePatch.notes = patch.notes;
  if (patch.status !== undefined) writePatch.status = patch.status;

  await ref.set(writePatch, { merge: true });
  const fresh = await ref.get();
  return apiOk(ctx, {
    event: serializeEventForApi(fresh.id, fresh.data()!, ctx.mode),
  });
});

export const DELETE = withApiAuth<{ id: string }>(async ({ params, ctx }) => {
  const ref = getAdminDb().doc(`events/${params.id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "event_not_found", "Event not found.");
  }
  const d = snap.data()!;
  if (d.subAccountId !== ctx.subAccountId || d.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "event_not_found", "Event not found.");
  }
  await ref.delete();
  void emitWebhookEvent({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    mode: ctx.mode,
    type: "booking.cancelled",
    payload: { event: { id: params.id, object: "event", deleted: true } },
  });
  return apiOk(ctx, { id: params.id, object: "event", deleted: true });
});
