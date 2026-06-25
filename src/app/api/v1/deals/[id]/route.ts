import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { withApiAuth } from "@/lib/api/auth";
import { apiError, apiOk } from "@/lib/api/responses";
import { emitDealEvents } from "@/lib/server/deals-service";
import {
  parseDealPatch,
  serializeDealForApi,
} from "@/lib/api/serializers/deals";
import { loadCustomFieldDefs } from "@/lib/custom-fields/load-defs";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";
import type { WebhookEventType } from "@/types/webhooks";

/**
 * Public API v1: single-deal routes.
 *
 *   GET    /api/v1/deals/:id     — fetch
 *   PATCH  /api/v1/deals/:id     — partial update
 *   DELETE /api/v1/deals/:id     — delete
 *
 * Stage-change semantics: PATCHing `stage` updates `stageChangedAt` to
 * server-now AND emits `deal.stage.changed`. Terminal-state transitions
 * (`won` / `lost`) ALSO emit `deal.won` / `deal.lost` so subscribers can
 * subscribe to those specifically without filtering server-side.
 */

export const GET = withApiAuth<{ id: string }>(async ({ params, ctx }) => {
  const snap = await getAdminDb().doc(`deals/${params.id}`).get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "deal_not_found", "Deal not found.");
  }
  const data = snap.data()!;
  if (data.subAccountId !== ctx.subAccountId || data.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "deal_not_found", "Deal not found.");
  }
  return apiOk(ctx, { deal: serializeDealForApi(snap.id, data, ctx.mode) });
});

export const PATCH = withApiAuth<{ id: string }>(async ({ body, params, ctx }) => {
  const parsed = parseDealPatch(body);
  if (!parsed.ok) {
    return apiError(ctx, "invalid_request", "invalid_body", parsed.error!);
  }
  const patch = parsed.value!;

  const ref = getAdminDb().doc(`deals/${params.id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "deal_not_found", "Deal not found.");
  }
  const existing = snap.data()!;
  if (existing.subAccountId !== ctx.subAccountId || existing.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "deal_not_found", "Deal not found.");
  }

  const previousStage = existing.stageId as string | undefined;
  const writePatch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.title !== undefined) writePatch.title = patch.title;
  if (patch.value !== undefined) writePatch.value = patch.value;
  if (patch.currency !== undefined) writePatch.currency = patch.currency;
  if (patch.priority !== undefined) writePatch.priority = patch.priority;
  if (patch.lostReason !== undefined) writePatch.lostReason = patch.lostReason;
  if (patch.territoryId !== undefined) writePatch.territoryId = patch.territoryId;

  if ((body as Record<string, unknown>).custom_fields !== undefined) {
    const cfDefs = await loadCustomFieldDefs(
      existing.subAccountId as string,
      "deal",
    );
    const cf = validateCustomFieldValues(
      (body as Record<string, unknown>).custom_fields,
      cfDefs,
    );
    if (!cf.ok) {
      return apiError(ctx, "invalid_request", "invalid_body", cf.error!);
    }
    writePatch.customFields = cf.value;
  }

  const stageChanged = patch.stage !== undefined && patch.stage !== previousStage;
  if (patch.stage !== undefined) {
    writePatch.stageId = patch.stage;
    if (stageChanged) {
      writePatch.stageChangedAt = FieldValue.serverTimestamp();
    }
  }

  await ref.set(writePatch, { merge: true });

  const fresh = await ref.get();
  const wire = serializeDealForApi(fresh.id, fresh.data()!, ctx.mode);

  // Always emit deal.updated. Stage changes also emit deal.stage.changed +
  // terminal-specific events so subscribers can filter cheaply.
  const events: { type: WebhookEventType; extra?: Record<string, unknown> }[] =
    [{ type: "deal.updated" }];
  if (stageChanged) {
    events.push({
      type: "deal.stage.changed",
      extra: { previous_stage: previousStage ?? null },
    });
    if (patch.stage === "won") events.push({ type: "deal.won" });
    else if (patch.stage === "lost") events.push({ type: "deal.lost" });
  }
  emitDealEvents({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    mode: ctx.mode,
    deal: wire,
    events,
  });

  return apiOk(ctx, { deal: wire });
});

export const DELETE = withApiAuth<{ id: string }>(async ({ params, ctx }) => {
  const ref = getAdminDb().doc(`deals/${params.id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return apiError(ctx, "not_found", "deal_not_found", "Deal not found.");
  }
  const existing = snap.data()!;
  if (existing.subAccountId !== ctx.subAccountId || existing.mode !== ctx.mode) {
    return apiError(ctx, "not_found", "deal_not_found", "Deal not found.");
  }
  await ref.delete();
  emitDealEvents({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    mode: ctx.mode,
    deal: serializeDealForApi(snap.id, existing, ctx.mode),
    events: [{ type: "deal.deleted" }],
  });
  return apiOk(ctx, { id: params.id, object: "deal", deleted: true });
});
