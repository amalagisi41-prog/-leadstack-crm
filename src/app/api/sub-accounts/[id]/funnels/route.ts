import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  websiteStudioGateOpen,
  WEBSITE_STUDIO_LOCKED_MESSAGE,
} from "@/lib/website-studio/gate";
import { getFunnelGoal } from "@/lib/funnels/catalog";
import type { FunnelContent, FunnelDoc, FunnelGoalId } from "@/types/funnel";

/**
 * Sales funnels — one-goal lead-capture landing pages.
 *
 * GET  — list all funnels for the sub-account.
 * POST — create a new draft funnel from a chosen goal (pre-fills content
 *        from the goal's starter copy). Returns the new funnel.
 *
 * Gated behind Website Studio (the paid add-on) — funnels are part of that
 * bundle per the pricing decision.
 */

const VALID_GOALS: FunnelGoalId[] = [
  "home_valuation",
  "buyer_leads",
  "listing_promo",
  "email_list",
];

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "funnel"
  );
}

/** Make a slug unique within the sub-account by suffixing -2, -3, … */
async function uniqueSlug(
  subAccountId: string,
  base: string,
): Promise<string> {
  const db = getAdminDb();
  const col = db.collection(`subAccounts/${subAccountId}/funnels`);
  let candidate = base;
  let n = 1;
  // Bounded loop — slugs collide rarely; cap at a sane number.
  while (n < 50) {
    const dupe = await col.where("slug", "==", candidate).limit(1).get();
    if (dupe.empty) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!(await websiteStudioGateOpen(subAccountId))) {
    return NextResponse.json(
      { error: WEBSITE_STUDIO_LOCKED_MESSAGE },
      { status: 403 },
    );
  }

  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/funnels`)
    .orderBy("createdAt", "desc")
    .get();

  const funnels = snap.docs.map((d) => d.data());
  return NextResponse.json({ funnels });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const { uid, agencyId } = access;
  if (!agencyId) {
    return NextResponse.json({ error: "Agency not found" }, { status: 400 });
  }

  if (!(await websiteStudioGateOpen(subAccountId))) {
    return NextResponse.json(
      { error: WEBSITE_STUDIO_LOCKED_MESSAGE },
      { status: 403 },
    );
  }

  let body: { goal?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const goalId = body.goal as FunnelGoalId;
  if (!VALID_GOALS.includes(goalId)) {
    return NextResponse.json({ error: "Pick a goal first." }, { status: 400 });
  }

  const goal = getFunnelGoal(goalId);
  const name = (body.name || goal.label).toString().trim().slice(0, 80);

  const content: FunnelContent = {
    goal: goalId,
    ...goal.starter,
    theme: "navy",
  };

  const db = getAdminDb();
  const ref = db.collection(`subAccounts/${subAccountId}/funnels`).doc();
  const slug = await uniqueSlug(subAccountId, slugify(name));

  const doc: Omit<FunnelDoc, "createdAt" | "updatedAt" | "publishedAt"> & {
    createdAt: FieldValue;
    updatedAt: FieldValue;
    publishedAt: null;
  } = {
    id: ref.id,
    subAccountId,
    agencyId,
    createdByUid: uid,
    name,
    slug,
    status: "draft",
    content,
    submissionCount: 0,
    publishedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);
  const fresh = await ref.get();
  return NextResponse.json({ ok: true, funnel: fresh.data() });
}
