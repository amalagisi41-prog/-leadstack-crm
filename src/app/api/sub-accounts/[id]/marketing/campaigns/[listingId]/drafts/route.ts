import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { CampaignChannel, CampaignBriefDoc } from "@/types/marketing-campaigns";
import { findDistressLanguage } from "@/lib/marketing/listing-boost";

const CHANNELS = new Set<CampaignChannel>([
  "landingPage", "facebook", "instagram", "email", "sms", "googleBusiness", "linkedin", "tiktok",
]);

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  let body: { channel?: unknown; body?: unknown };
  try { body = (await request.json()) as { channel?: unknown; body?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const textBody = typeof body.body === "string" ? body.body.trim() : "";
  if (typeof body.channel !== "string" || !CHANNELS.has(body.channel as CampaignChannel) || !textBody) {
    return NextResponse.json({ error: "A valid channel and draft body are required." }, { status: 400 });
  }
  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Campaign brief not found." }, { status: 404 });
  const brief = snap.data() as Omit<CampaignBriefDoc, "id">;
  const channel = body.channel as CampaignChannel;
  const findings = findDistressLanguage(textBody).map((finding) => finding.phrase);
  const channels = brief.brief.channels.map((draft) => draft.channel === channel
    ? { ...draft, body: textBody, status: findings.length ? "needs-review" as const : "ready" as const, findings }
    : draft);
  const now = FieldValue.serverTimestamp();
  await ref.set({ brief: { ...brief.brief, channels }, approvedChannels: [], updatedAt: now }, { merge: true });
  return NextResponse.json({ ok: true, approvedChannels: [], channel, body: textBody, updatedByUid: access.uid });
}
