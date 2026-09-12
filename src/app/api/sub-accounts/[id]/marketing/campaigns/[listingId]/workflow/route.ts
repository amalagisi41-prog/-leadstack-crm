import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { CampaignWorkflowStep, CampaignChannel } from "@/types/marketing-campaigns";

const STEPS: CampaignWorkflowStep[] = ["create", "optimize", "schedule", "archive"];
const CHANNELS: CampaignChannel[] = ["landingPage", "facebook", "instagram", "email", "sms", "googleBusiness", "linkedin", "tiktok"];

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string; listingId: string }> }) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const step = body?.step;
  if (typeof step !== "string" || !STEPS.includes(step as CampaignWorkflowStep)) {
    return NextResponse.json({ error: "Choose a valid campaign workflow step." }, { status: 400 });
  }
  const schedulePlan = body?.schedulePlan && typeof body.schedulePlan === "object"
    ? Object.fromEntries(Object.entries(body.schedulePlan).filter(([channel, value]) => CHANNELS.includes(channel as CampaignChannel) && (value === null || typeof value === "string")))
    : undefined;
  const ref = getAdminDb().doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  await ref.set({
    workflowStep: step,
    ...(schedulePlan ? { schedulePlan } : {}),
    archivedAt: step === "archive" ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return NextResponse.json({ ok: true, workflowStep: step, schedulePlan: schedulePlan ?? null });
}
