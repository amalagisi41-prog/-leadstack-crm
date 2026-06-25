import "server-only";

import { FieldValue, type Query } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { withApiAuth } from "@/lib/api/auth";
import { apiError, apiOk } from "@/lib/api/responses";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  parseContactCreate,
  serializeContactForApi,
} from "@/lib/api/serializers/contacts";
import { loadCustomFieldDefs } from "@/lib/custom-fields/load-defs";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Public API v1: Contacts collection-level routes.
 *
 *   GET  /api/v1/contacts                  — list (cursor pagination)
 *        ?limit=20&starting_after=<id>
 *   POST /api/v1/contacts                  — create
 *
 * Tenancy: every contact carries `agencyId` + `subAccountId` + `mode` and
 * is filtered strictly by `subAccountId` (from `ctx`) AND `mode` (from
 * `ctx`). Test-mode requests can NEVER read or write live contacts and
 * vice-versa — the wall is enforced in code, not rules (writes go via
 * Admin SDK).
 *
 * Pagination: `starting_after` is a contact id. The route reads that doc's
 * `createdAt` and uses it as the Firestore cursor. Default limit 20, max
 * 100. Returns `has_more: true` when the next page would have results.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const GET = withApiAuth(async ({ request, ctx }) => {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;
  const startingAfter = url.searchParams.get("starting_after");

  const db = getAdminDb();
  let q: Query = db
    .collection("contacts")
    .where("subAccountId", "==", ctx.subAccountId)
    .where("mode", "==", ctx.mode)
    .orderBy("createdAt", "desc");

  if (startingAfter) {
    const cursorSnap = await db.doc(`contacts/${startingAfter}`).get();
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

  // Fetch limit + 1 to know if there's another page without a second query.
  const snap = await q.limit(limit + 1).get();
  const docs = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;
  const data = docs.map((d) =>
    serializeContactForApi(d.id, d.data(), ctx.mode),
  );

  return apiOk(ctx, {
    object: "list",
    data,
    has_more: hasMore,
    url: "/v1/contacts",
  });
});

export const POST = withApiAuth(async ({ body, ctx }) => {
  const parsed = parseContactCreate(body);
  if (!parsed.ok) {
    return apiError(ctx, "invalid_request", "invalid_body", parsed.error!);
  }
  const input = parsed.value!;

  // Validate any custom_fields against the sub-account's contact definitions.
  const cfDefs = await loadCustomFieldDefs(ctx.subAccountId, "contact");
  const cf = validateCustomFieldValues(
    (body as Record<string, unknown>).custom_fields,
    cfDefs,
  );
  if (!cf.ok) {
    return apiError(ctx, "invalid_request", "invalid_body", cf.error!);
  }

  const db = getAdminDb();
  const ref = db.collection("contacts").doc();
  const now = new Date();
  await ref.set({
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    address: input.address,
    source: input.source,
    tags: input.tags,
    pipelineStage: input.pipelineStage,
    territoryId: input.territoryId ?? GLOBAL_TERRITORY_ID,
    customFields: cf.value,
    attribution: null,
    emailOptedOut: false,
    smsOptedOut: false,
    countryCode: null,
    country: null,
    city: null,
    lat: null,
    lng: null,
    agencyId: ctx.agencyId,
    subAccountId: ctx.subAccountId,
    // `createdByUid` carries the API key id (prefixed) so audit trails
    // can distinguish dashboard creates from API creates. Same column the
    // dashboard would have used for a Firebase Auth uid — readers don't
    // need to special-case it.
    createdByUid: `apikey:${ctx.keyPrefix}`,
    mode: ctx.mode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Re-read so the response carries the resolved serverTimestamp values.
  const created = await ref.get();
  const wire = serializeContactForApi(created.id, created.data()!, ctx.mode);
  // Wire timestamp-from-serverTimestamp can land as a Date or Timestamp;
  // the serializer handles both. Fall back to `now` if the field hasn't
  // resolved yet (rare — serverTimestamp resolves before .get() returns).
  if (wire.created_at === new Date(0).toISOString()) {
    wire.created_at = now.toISOString();
    wire.updated_at = now.toISOString();
  }

  void emitWebhookEvent({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    mode: ctx.mode,
    type: "contact.created",
    payload: { contact: wire },
  });

  return apiOk(ctx, { contact: wire }, { status: 201 });
});
