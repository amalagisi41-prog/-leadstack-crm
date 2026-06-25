import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { endCallViaControl } from "@/lib/comms/voice/vapi";
import type { VoiceCampaignDoc, VoiceCampaignRecipientDoc } from "@/types";

export const dynamic = "force-dynamic";

type Body = { campaignId?: string; mode?: "scheduled" | "all" };

/**
 * Kill switch for a bulk calling campaign. Two modes:
 *
 *   - "scheduled" (default): flip to "cancelled" and skip every still-queued
 *     recipient. Calls already CONNECTED finish naturally (capped by
 *     maxCallSeconds).
 *   - "all": same as above, AND end every still-live call this campaign
 *     placed by POSTing end-call to each stored control URL.
 *
 * QStash messages already scheduled still fire, but the step route sees the
 * cancelled status / already-settled rows and no-ops.
 *
 * A call can only be ended within its max duration, so for "all" we only
 * look at recipients dialled in the last 15 minutes — that's a small set
 * (per-minute pacing) and guaranteed to cover anything still live. Ending
 * an already-finished call is harmless (Vapi 4xx, swallowed).
 */
const LIVE_LOOKBACK_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const campaignId = payload.campaignId?.trim();
  const mode = payload.mode === "all" ? "all" : "scheduled";
  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const campaignRef = db.collection("voiceCampaigns").doc(campaignId);
  const snap = await campaignRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  const campaign = snap.data() as VoiceCampaignDoc;

  const access = await requireSubAccountMember(request, campaign.subAccountId);
  if (access instanceof NextResponse) return access;

  const alreadyStopped =
    campaign.status === "completed" || campaign.status === "cancelled";

  // End live calls FIRST (only meaningful for "all"). Even if the campaign
  // was already cancelled (scheduled-stop earlier), an operator can hit
  // "stop all" to also kill calls still ringing from that first stop.
  let endedLive = 0;
  if (mode === "all") {
    const cutoff = Timestamp.fromMillis(Date.now() - LIVE_LOOKBACK_MS);
    // Single-field range query (settledAt) — no composite index needed.
    // Queued rows have settledAt null and are excluded by the range.
    const recentSnap = await campaignRef
      .collection("recipients")
      .where("settledAt", ">=", cutoff)
      .get();
    const live = recentSnap.docs
      .map((d) => d.data() as VoiceCampaignRecipientDoc)
      .filter((r) => r.status === "called" && !!r.callControlUrl);
    const results = await Promise.allSettled(
      live.map((r) => endCallViaControl(r.callControlUrl as string)),
    );
    endedLive = results.filter((r) => r.status === "fulfilled").length;
  }

  if (alreadyStopped) {
    return NextResponse.json({
      ok: true,
      alreadyStopped: campaign.status,
      endedLive,
    });
  }

  // Skip every still-queued recipient in batches, then flip the campaign.
  const queuedSnap = await campaignRef
    .collection("recipients")
    .where("status", "==", "queued")
    .get();

  let stopped = 0;
  const docs = queuedSnap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 400)) {
      batch.update(d.ref, {
        status: "skipped",
        skippedReason: "cancelled",
        settledAt: FieldValue.serverTimestamp(),
      });
      stopped += 1;
    }
    await batch.commit();
  }

  await campaignRef.update({
    status: "cancelled",
    completedAt: FieldValue.serverTimestamp(),
    ...(stopped > 0
      ? {
          "totals.skipped": FieldValue.increment(stopped),
          "totals.queued": FieldValue.increment(-stopped),
        }
      : {}),
  });

  return NextResponse.json({ ok: true, stopped, endedLive });
}
