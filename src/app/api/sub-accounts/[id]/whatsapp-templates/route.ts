import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { sanitiseVariables } from "@/lib/comms/whatsapp/template-validation";
import type { SubAccountDoc } from "@/types";
import type { WhatsappTemplateCategory } from "@/types/whatsapp-templates";

export const dynamic = "force-dynamic";

/**
 * WhatsApp templates CRUD (list + create draft). Drafts are created here;
 * submission for Meta approval is a separate route ([templateId]/submit).
 * Admin-only. Creating a draft doesn't require a configured sender (you can
 * draft before connecting), but the agency WhatsApp gate must be on.
 */

const VALID_CATEGORIES: WhatsappTemplateCategory[] = [
  "UTILITY",
  "MARKETING",
  "AUTHENTICATION",
];

interface CreateBody {
  displayName?: string;
  category?: string;
  language?: string;
  body?: string;
  variables?: unknown;
}

async function requireWhatsappGate(
  subAccountId: string,
): Promise<NextResponse | { sub: SubAccountDoc }> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const sub = snap.exists ? (snap.data() as SubAccountDoc) : null;
  if (sub?.whatsappEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "WhatsApp is disabled for this sub-account by your agency." },
      { status: 403 },
    );
  }
  return { sub };
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, subAccountId);
  if (auth instanceof NextResponse) return auth;

  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/whatsappTemplates`)
    .orderBy("createdAt", "desc")
    .get();
  const templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ templates });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, subAccountId);
  if (auth instanceof NextResponse) return auth;

  const gate = await requireWhatsappGate(subAccountId);
  if (gate instanceof NextResponse) return gate;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const displayName = body.displayName?.trim() ?? "";
  const templateBody = body.body?.trim() ?? "";
  const category = (body.category ?? "").toUpperCase() as WhatsappTemplateCategory;
  const language = (body.language?.trim() || "en").slice(0, 12);

  if (!displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }
  if (!templateBody) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: "category must be UTILITY, MARKETING, or AUTHENTICATION" },
      { status: 400 },
    );
  }
  const sanitised = sanitiseVariables(body.variables ?? [], templateBody);
  if ("error" in sanitised) {
    return NextResponse.json({ error: sanitised.error }, { status: 400 });
  }

  const ref = getAdminDb()
    .collection(`subAccounts/${subAccountId}/whatsappTemplates`)
    .doc();
  await ref.set({
    subAccountId,
    agencyId: gate.sub.agencyId,
    name: "",
    displayName: displayName.slice(0, 120),
    category,
    language,
    body: templateBody.slice(0, 1024),
    variables: sanitised.variables,
    contentSid: null,
    status: "draft",
    rejectionReason: null,
    pollAttempts: 0,
    lastSyncedAt: null,
    createdByUid: auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    approvedAt: null,
  });

  const created = await ref.get();
  return NextResponse.json({ ok: true, template: { id: ref.id, ...created.data() } });
}
