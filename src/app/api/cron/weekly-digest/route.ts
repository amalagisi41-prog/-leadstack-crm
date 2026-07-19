import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";

/**
 * Fired weekly by the "agentstack-weekly-digest" QStash schedule (see
 * lib/qstash/register-schedules.ts). Fans out one staggered callback per
 * sub-account that has opted into the Daily Briefing (shared toggle — see
 * lib/digest/send.ts) to /api/cron/weekly-digest/step, mirroring the
 * daily-briefing fan-out. Fixed UTC cron (not per-timezone) — a weekly
 * summary doesn't need the "exactly 7am local" precision the daily
 * briefing does.
 */

const STAGGER_SECONDS = 2;

export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const db = getAdminDb();
  const snap = await db
    .collection("subAccounts")
    .where("dailyBriefingEnabled", "==", true)
    .get();

  const subAccountIds = snap.docs.map((d) => d.id);
  const runTag = Math.floor(Date.now() / 1000);
  let scheduled = 0;
  for (let i = 0; i < subAccountIds.length; i++) {
    const subAccountId = subAccountIds[i];
    const result = await publishCallback({
      pathname: "/api/cron/weekly-digest/step",
      body: { subAccountId },
      delaySeconds: i * STAGGER_SECONDS,
      deduplicationId: `weekly_digest_${subAccountId}_${runTag}`,
    });
    if (result) scheduled += 1;
  }

  return NextResponse.json({
    ok: true,
    candidates: subAccountIds.length,
    scheduled,
  });
}
