import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createDealServerSide } from "@/lib/server/deals-service";
import { loadCustomFieldDefs } from "@/lib/custom-fields/load-defs";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";
import { PIPELINE_STAGES, DEAL_PRIORITIES } from "@/types/deals";
import type { DealPriority, PipelineStageId } from "@/types/deals";

/**
 * Dashboard-facing deal creation. Replaces the browser's direct Firestore
 * write so `deal.created` fires (and the create activity is logged) through
 * the shared service.
 */

const VALID_STAGES = new Set(PIPELINE_STAGES.map((s) => s.id));
const VALID_PRIORITIES = new Set(DEAL_PRIORITIES.map((p) => p.id));

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId =
    typeof body.subAccountId === "string" ? body.subAccountId.trim() : "";
  if (!subAccountId) {
    return NextResponse.json({ error: "subAccountId is required" }, { status: 400 });
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const stageId = body.stageId as PipelineStageId;
  if (!VALID_STAGES.has(stageId)) {
    return NextResponse.json({ error: "Invalid stageId" }, { status: 400 });
  }
  const priority = (
    VALID_PRIORITIES.has(body.priority as DealPriority) ? body.priority : "medium"
  ) as DealPriority;

  const value =
    typeof body.value === "number" && Number.isFinite(body.value) && body.value >= 0
      ? body.value
      : 0;
  const currency =
    typeof body.currency === "string" && body.currency.length === 3
      ? body.currency.toUpperCase()
      : "USD";

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  // Validate custom-field values against the sub-account's deal definitions.
  const defs = await loadCustomFieldDefs(subAccountId, "deal");
  const cf = validateCustomFieldValues(body.customFields, defs);
  if (!cf.ok) {
    return NextResponse.json({ error: cf.error }, { status: 400 });
  }

  const { id, deal } = await createDealServerSide({
    subAccountId,
    agencyId,
    createdByUid: access.uid,
    mode: "live",
    title,
    value,
    currency,
    contactId,
    stageId,
    priority,
    territoryId: typeof body.territoryId === "string" ? body.territoryId : null,
    customFields: cf.value,
  });

  return NextResponse.json({ id, deal }, { status: 201 });
}
