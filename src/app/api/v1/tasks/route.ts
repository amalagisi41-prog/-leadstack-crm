import "server-only";

import { FieldValue, type Query } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { withApiAuth } from "@/lib/api/auth";
import { apiError, apiOk } from "@/lib/api/responses";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  parseTaskCreate,
  serializeTaskForApi,
} from "@/lib/api/serializers/tasks";
import { GLOBAL_TERRITORY_ID } from "@/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const GET = withApiAuth(async ({ request, ctx }) => {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;
  const startingAfter = url.searchParams.get("starting_after");
  const completedParam = url.searchParams.get("completed");
  const contactId = url.searchParams.get("contact_id");

  const db = getAdminDb();
  let q: Query = db
    .collection("tasks")
    .where("subAccountId", "==", ctx.subAccountId)
    .where("mode", "==", ctx.mode);
  if (completedParam === "true") q = q.where("completed", "==", true);
  else if (completedParam === "false") q = q.where("completed", "==", false);
  if (contactId) q = q.where("contactId", "==", contactId);
  q = q.orderBy("createdAt", "desc");

  if (startingAfter) {
    const cursorSnap = await db.doc(`tasks/${startingAfter}`).get();
    if (!cursorSnap.exists) {
      return apiError(
        ctx,
        "invalid_request",
        "invalid_cursor",
        `starting_after=${startingAfter} not found.`,
      );
    }
    const cursor = cursorSnap.data()!;
    if (cursor.subAccountId !== ctx.subAccountId || cursor.mode !== ctx.mode) {
      return apiError(
        ctx,
        "invalid_request",
        "invalid_cursor",
        "Cursor belongs to a different sub-account or mode.",
      );
    }
    q = q.startAfter(cursor.createdAt);
  }

  const snap = await q.limit(limit + 1).get();
  const docs = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;
  return apiOk(ctx, {
    object: "list",
    data: docs.map((d) => serializeTaskForApi(d.id, d.data(), ctx.mode)),
    has_more: hasMore,
    url: "/v1/tasks",
  });
});

export const POST = withApiAuth(async ({ body, ctx }) => {
  const parsed = parseTaskCreate(body);
  if (!parsed.ok) {
    return apiError(ctx, "invalid_request", "invalid_body", parsed.error!);
  }
  const input = parsed.value!;
  const db = getAdminDb();

  // If a contact_id is provided, verify it exists in same tenancy + mode and
  // inherit its territory.
  let inheritedTerritory: string | null = null;
  if (input.contactId) {
    const cs = await db.doc(`contacts/${input.contactId}`).get();
    if (!cs.exists) {
      return apiError(
        ctx,
        "invalid_request",
        "contact_not_found",
        `contact_id=${input.contactId} does not exist.`,
      );
    }
    const cd = cs.data()!;
    if (cd.subAccountId !== ctx.subAccountId || cd.mode !== ctx.mode) {
      return apiError(
        ctx,
        "invalid_request",
        "contact_not_found",
        `contact_id=${input.contactId} does not exist.`,
      );
    }
    inheritedTerritory = (cd.territoryId as string | null) ?? null;
  }

  const ref = db.collection("tasks").doc();
  const now = new Date();
  await ref.set({
    title: input.title,
    notes: input.notes,
    dueAt: input.dueAt,
    completed: false,
    completedAt: null,
    contactId: input.contactId,
    dealId: input.dealId,
    eventId: input.eventId,
    territoryId:
      input.territoryId ?? inheritedTerritory ?? GLOBAL_TERRITORY_ID,
    agencyId: ctx.agencyId,
    subAccountId: ctx.subAccountId,
    createdByUid: `apikey:${ctx.keyPrefix}`,
    mode: ctx.mode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const created = await ref.get();
  const wire = serializeTaskForApi(created.id, created.data()!, ctx.mode);
  if (wire.created_at === new Date(0).toISOString()) {
    wire.created_at = now.toISOString();
    wire.updated_at = now.toISOString();
  }
  void emitWebhookEvent({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    mode: ctx.mode,
    type: "task.created",
    payload: { task: wire },
  });
  return apiOk(ctx, { task: wire }, { status: 201 });
});
