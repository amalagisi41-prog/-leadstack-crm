import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { CampaignApprovalAuditDoc, CampaignBriefDoc, CampaignChannel } from "@/types/marketing-campaigns";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  let body: { channel?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as { channel?: unknown; reason?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.channel !== "string" || typeof body.reason !== "string" || !body.reason.trim()) {
    return NextResponse.json({ error: "Choose a channel and record a decline reason." }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Campaign brief not found." }, { status: 404 });
  const brief = snap.data() as Omit<CampaignBriefDoc, "id">;
  const channel = body.channel as CampaignChannel;
  if (!brief.brief.channels.some((draft) => draft.channel === channel)) {
    return NextResponse.json({ error: "That channel is not part of this campaign." }, { status: 400 });
  }

  const now = FieldValue.serverTimestamp();
  const audit: Omit<CampaignApprovalAuditDoc, "approvedAt"> & {
    approvedAt: unknown;
    decision: "declined";
    reason: string;
  } = {
    briefId: listingId,
    subAccountId: id,
    listingId,
    approvedByUid: access.uid,
    approvedAt: now,
    channels: [channel],
    screensCleared: [],
    decision: "declined",
    reason: body.reason.trim(),
  };
  await db.collection(`subAccounts/${id}/campaignBriefs/${listingId}/approvalAudit`).add(audit);
  await ref.update({
    approvedChannels: (brief.approvedChannels ?? []).filter((item) => item !== channel),
    updatedAt: now,
  });
  return NextResponse.json({ ok: true, channel, decision: "declined" });
}
