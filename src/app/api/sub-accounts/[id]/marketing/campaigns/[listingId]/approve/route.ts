import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { CampaignBriefDoc, CampaignChannel, CampaignApprovalAuditDoc } from "@/types/marketing-campaigns";
import type { ComplianceScreen } from "@/lib/marketing/tool-registry";

export async function POST(request: Request, ctx: { params: Promise<{ id: string; listingId: string }> }) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Campaign brief not found." }, { status: 404 });
  const brief = snap.data() as Omit<CampaignBriefDoc, "id">;
  let body: { channels?: unknown } = {};
  try { body = (await request.json()) as { channels?: unknown }; } catch { /* empty means all ready channels */ }
  const wanted = Array.isArray(body.channels) ? body.channels.filter((c): c is CampaignChannel => typeof c === "string") : brief.brief.channels.map((c) => c.channel);
  const selected = brief.brief.channels.filter((c) => wanted.includes(c.channel));
  const blocked = selected.filter((c) => c.status !== "ready" || c.findings.length > 0);
  if (blocked.length) return NextResponse.json({ error: "Every selected draft must clear its compliance screens first.", blocked: blocked.map((c) => ({ channel: c.channel, findings: c.findings })) }, { status: 422 });
  const screens = [...new Set(selected.flatMap((c) => c.screens))] as ComplianceScreen[];
  const now = FieldValue.serverTimestamp();
  const audit: Omit<CampaignApprovalAuditDoc, "approvedAt"> & { approvedAt: unknown } = { briefId: listingId, subAccountId: id, listingId, approvedByUid: access.uid, approvedAt: now, channels: selected.map((c) => c.channel), screensCleared: screens };
  await db.collection(`subAccounts/${id}/campaignBriefs/${listingId}/approvalAudit`).add(audit);
  await ref.update({ approvedChannels: selected.map((c) => c.channel), updatedAt: now });
  return NextResponse.json({ ok: true, approvedChannels: selected.map((c) => c.channel) });
}
