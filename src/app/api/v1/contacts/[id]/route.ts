import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { withApiAuth } from "@/lib/api/auth";
import { apiError, apiOk } from "@/lib/api/responses";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  parseContactPatch,
  serializeContactForApi,
  type ContactCreateInput,
} from "@/lib/api/serializers/contacts";
import { loadCustomFieldDefs } from "@/lib/custom-fields/load-defs";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";

/**
 * Public API v1: single-contact routes.
 *
 *   GET    /api/v1/contacts/:id   — fetch
 *   PATCH  /api/v1/contacts/:id   — partial update (any subset of writable fields)
 *   DELETE /api/v1/contacts/:id   — delete (and unlink referencing deals/tasks/events,
 *                                   same cleanup as the dashboard delete route)
 *
 * Tenancy enforcement: every operation re-reads the doc and verifies
 * `data.subAccountId === ctx.subAccountId` AND `data.mode === ctx.mode`.
 * Cross-tenant / cross-mode access returns 404 (not 403) — we never reveal
 * whether the id exists in another scope.
 *
 * Webhook emission: contact.updated fires on PATCH, contact.deleted on
 * DELETE. The dispatcher is fire-and-forget; failures don't roll back the
 * write.
 */

export const GET = withApiAuth<{ id: string }>(async ({ params, ctx }) => {
  const snap = await getAdminDb().doc(`contacts/${params.id}`).get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "contact_not_found", "Contact not found.");
  }
  const data = snap.data()!;
  if (data.subAccountId !== ctx.subAccountId || data.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "contact_not_found", "Contact not found.");
  }
  return apiOk(ctx, {
    contact: serializeContactForApi(snap.id, data, ctx.mode),
  });
});

export const PATCH = withApiAuth<{ id: string }>(async ({ body, params, ctx }) => {
  const parsed = parseContactPatch(body);
  if (!parsed.ok) {
    return apiError(ctx, "invalid_request", "invalid_body", parsed.error!);
  }
  const patch = parsed.value!;

  const ref = getAdminDb().doc(`contacts/${params.id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "contact_not_found", "Contact not found.");
  }
  const existing = snap.data()!;
  if (existing.subAccountId !== ctx.subAccountId || existing.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "contact_not_found", "Contact not found.");
  }

  // Internal-shape patch — map back from `ContactCreateInput` field names
  // (which already use the internal camelCase shape).
  const writePatch: Partial<ContactCreateInput> & {
    updatedAt: FirebaseFirestore.FieldValue;
  } = {
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // custom_fields is a full replacement of the value map when provided.
  if ((body as Record<string, unknown>).custom_fields !== undefined) {
    const cfDefs = await loadCustomFieldDefs(ctx.subAccountId, "contact");
    const cf = validateCustomFieldValues(
      (body as Record<string, unknown>).custom_fields,
      cfDefs,
    );
    if (!cf.ok) {
      return apiError(ctx, "invalid_request", "invalid_body", cf.error!);
    }
    writePatch.customFields = cf.value;
  }

  await ref.set(writePatch, { merge: true });

  const fresh = await ref.get();
  const wire = serializeContactForApi(fresh.id, fresh.data()!, ctx.mode);

  void emitWebhookEvent({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    mode: ctx.mode,
    type: "contact.updated",
    payload: { contact: wire },
  });

  return apiOk(ctx, { contact: wire });
});

export const DELETE = withApiAuth<{ id: string }>(async ({ params, ctx }) => {
  const db = getAdminDb();
  const ref = db.doc(`contacts/${params.id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "contact_not_found", "Contact not found.");
  }
  const existing = snap.data()!;
  if (existing.subAccountId !== ctx.subAccountId || existing.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "contact_not_found", "Contact not found.");
  }

  // Mirror the dashboard delete cleanup (see src/app/api/contacts/[id]/route.ts):
  //   1. Recursive-delete the contact + subcollections (notes, activities).
  //   2. Delete deals that reference the contact.
  //   3. Null-out contactId on tasks + events (preserve standalone usefulness).
  await db.recursiveDelete(ref);

  // Same-mode filter on the cascade so live deletes don't blow away test
  // deals and vice-versa.
  const dealsSnap = await db
    .collection("deals")
    .where("subAccountId", "==", ctx.subAccountId)
    .where("mode", "==", ctx.mode)
    .where("contactId", "==", params.id)
    .get();
  if (!dealsSnap.empty) {
    const batch = db.batch();
    for (const d of dealsSnap.docs) batch.delete(d.ref);
    await batch.commit();
  }

  for (const collection of ["tasks", "events"] as const) {
    const s = await db
      .collection(collection)
      .where("subAccountId", "==", ctx.subAccountId)
      .where("mode", "==", ctx.mode)
      .where("contactId", "==", params.id)
      .get();
    if (s.empty) continue;
    const batch = db.batch();
    for (const d of s.docs) batch.update(d.ref, { contactId: null });
    await batch.commit();
  }

  void emitWebhookEvent({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    mode: ctx.mode,
    type: "contact.deleted",
    payload: {
      contact: { id: params.id, object: "contact", deleted: true },
    },
  });

  return apiOk(ctx, { id: params.id, object: "contact", deleted: true });
});
