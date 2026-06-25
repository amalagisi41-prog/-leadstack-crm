import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { sanitiseVariables } from "@/lib/comms/whatsapp/template-validation";
import type {
  WhatsappTemplateCategory,
  WhatsappTemplateDoc,
} from "@/types/whatsapp-templates";

export const dynamic = "force-dynamic";

/**
 * Edit / delete a single WhatsApp template. Only mutable while NOT live —
 * i.e. status is draft, rejected, or failed (Meta makes approved templates
 * immutable; to change an approved one you create a new template). Editing a
 * rejected/failed template resets it to draft so the operator can fix + resubmit.
 */

const EDITABLE: ReadonlyArray<string> = ["draft", "rejected", "failed"];
const VALID_CATEGORIES: WhatsappTemplateCategory[] = [
  "UTILITY",
  "MARKETING",
  "AUTHENTICATION",
];

interface PatchBody {
  displayName?: string;
  category?: string;
  language?: string;
  body?: string;
  variables?: unknown;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id: subAccountId, templateId } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, subAccountId);
  if (auth instanceof NextResponse) return auth;

  const ref = getAdminDb().doc(
    `subAccounts/${subAccountId}/whatsappTemplates/${templateId}`,
  );
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  const existing = snap.data() as WhatsappTemplateDoc;
  if (!EDITABLE.includes(existing.status)) {
    return NextResponse.json(
      {
        error: `A ${existing.status} template can't be edited. Create a new template instead.`,
      },
      { status: 409 },
    );
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const nextBody = (body.body ?? existing.body).trim();
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    // Editing a rejected/failed template returns it to draft.
    status: "draft",
    rejectionReason: null,
  };

  if (typeof body.displayName === "string") {
    const dn = body.displayName.trim();
    if (!dn) return NextResponse.json({ error: "displayName can't be empty" }, { status: 400 });
    updates.displayName = dn.slice(0, 120);
  }
  if (typeof body.category === "string") {
    const cat = body.category.toUpperCase() as WhatsappTemplateCategory;
    if (!VALID_CATEGORIES.includes(cat)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    updates.category = cat;
  }
  if (typeof body.language === "string") {
    updates.language = (body.language.trim() || "en").slice(0, 12);
  }
  if (typeof body.body === "string") {
    if (!nextBody) return NextResponse.json({ error: "body can't be empty" }, { status: 400 });
    updates.body = nextBody.slice(0, 1024);
  }
  // Re-validate variables against the (possibly new) body whenever either
  // body or variables changed.
  if (body.variables !== undefined || typeof body.body === "string") {
    const rawVars = body.variables ?? existing.variables;
    const sanitised = sanitiseVariables(rawVars, nextBody);
    if ("error" in sanitised) {
      return NextResponse.json({ error: sanitised.error }, { status: 400 });
    }
    updates.variables = sanitised.variables;
  }

  await ref.update(updates);
  const updated = await ref.get();
  return NextResponse.json({ ok: true, template: { id: ref.id, ...updated.data() } });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id: subAccountId, templateId } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, subAccountId);
  if (auth instanceof NextResponse) return auth;

  const ref = getAdminDb().doc(
    `subAccounts/${subAccountId}/whatsappTemplates/${templateId}`,
  );
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  const existing = snap.data() as WhatsappTemplateDoc;
  // Don't allow deleting a pending/approved template — it exists in Twilio/Meta
  // and an in-flight approval or live template shouldn't be silently orphaned.
  if (existing.status === "pending" || existing.status === "approved") {
    return NextResponse.json(
      {
        error: `A ${existing.status} template can't be deleted from here. Pause or disable it in Twilio first.`,
      },
      { status: 409 },
    );
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
