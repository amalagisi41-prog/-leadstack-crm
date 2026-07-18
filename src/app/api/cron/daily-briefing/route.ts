import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";

/**
 * Fired hourly by the "leadstack-daily-briefing" QStash schedule (see
 * lib/qstash/register-schedules.ts). Fans out one staggered callback per
 * sub-account that has opted into the Daily Briefing to
 * /api/cron/daily-briefing/step, mirroring the workflow-time-triggers
 * fan-out. Hourly (not daily) because each sub-account's actual send time
 * depends on ITS OWN local clock hitting 7am — `sendDailyBriefingForSubAccount`
 * is the one that decides whether now is actually the right hour for that
 * sub-account's timezone, and its `lastBriefingSentDate` dedup guard makes
 * checking every sub-account every hour safe (at most one real send per
 * sub-account per local day).
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
      pathname: "/api/cron/daily-briefing/step",
      body: { subAccountId },
      delaySeconds: i * STAGGER_SECONDS,
      deduplicationId: `daily_briefing_${subAccountId}_${runTag}`,
    });
    if (result) scheduled += 1;
  }

  return NextResponse.json({
    ok: true,
    candidates: subAccountIds.length,
    scheduled,
  });
}
