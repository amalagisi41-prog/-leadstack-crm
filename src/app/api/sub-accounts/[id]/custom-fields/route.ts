import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import {
  slugifyFieldKey,
  validateFieldDefInput,
} from "@/lib/custom-fields/validation";
import { MAX_CUSTOM_FIELDS_PER_ENTITY } from "@/types/custom-fields";
import type { CustomFieldDef } from "@/types/custom-fields";

/**
 * Custom-field definitions per sub-account.
 *
 * GET  — list definitions (optionally `?entity=contact|deal`). Member-readable.
 * POST — create a definition. Sub-account admin only. Generates a stable
 *        snake_case `key` from the label, unique within (sub-account, entity).
 */

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const entity = new URL(request.url).searchParams.get("entity");
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/customFields`)
    .get();
  let fields = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CustomFieldDef, "id">) }),
  );
  if (entity === "contact" || entity === "deal") {
    fields = fields.filter((f) => f.entity === entity);
  }
  fields.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return NextResponse.json({ ok: true, fields });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateFieldDefInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const data = validated.value;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const agencyId = (subSnap.data()?.agencyId as string | undefined) ?? null;
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing tenancy metadata." },
      { status: 500 },
    );
  }

  // Load existing defs for this entity → enforce the cap + unique key.
  const existingSnap = await db
    .collection(`subAccounts/${subAccountId}/customFields`)
    .get();
  const existing = existingSnap.docs.map(
    (d) => d.data() as Omit<CustomFieldDef, "id">,
  );
  const sameEntity = existing.filter((f) => f.entity === data.entity);
  if (sameEntity.length >= MAX_CUSTOM_FIELDS_PER_ENTITY) {
    return NextResponse.json(
      {
        error: `At most ${MAX_CUSTOM_FIELDS_PER_ENTITY} custom fields per ${data.entity}.`,
      },
      { status: 400 },
    );
  }

  // Unique snake_case key within (sub-account, entity).
  const base = slugifyFieldKey(data.label) || "field";
  const taken = new Set(sameEntity.map((f) => f.key));
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`;

  const nextOrder =
    sameEntity.reduce((max, f) => Math.max(max, f.order ?? 0), -1) + 1;

  const ref = db.collection(`subAccounts/${subAccountId}/customFields`).doc();
  const now = FieldValue.serverTimestamp();
  const docPayload: Omit<CustomFieldDef, "id"> = {
    entity: data.entity,
    key,
    label: data.label,
    type: data.type,
    options: data.options,
    required: data.required,
    order: nextOrder,
    agencyId,
    subAccountId,
    createdByUid: access.uid,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(docPayload);

  return NextResponse.json({ ok: true, id: ref.id, key });
}
