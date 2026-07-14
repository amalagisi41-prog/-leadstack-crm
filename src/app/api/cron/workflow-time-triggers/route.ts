import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";

/**
 * Fired daily by the "leadstack-workflow-time-triggers" QStash schedule (see
 * lib/qstash/register-schedules.ts). Fans out one staggered callback per
 * sub-account that has at least one active time-based-trigger workflow to
 * /api/cron/workflow-time-triggers/step, mirroring the
 * idx-listing-sync fan-out.
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
    .collection("workflows")
    .where("status", "==", "active")
    .where("trigger.type", "in", [
      "contact.birthday",
      "contact.home_anniversary",
      "contact.stale",
    ])
    .get();

  const subAccountIds = [
    ...new Set(snap.docs.map((d) => d.data().subAccountId as string)),
  ].filter(Boolean);

  const runTag = Math.floor(Date.now() / 1000);
  let scheduled = 0;
  for (let i = 0; i < subAccountIds.length; i++) {
    const subAccountId = subAccountIds[i];
    const result = await publishCallback({
      pathname: "/api/cron/workflow-time-triggers/step",
      body: { subAccountId },
      delaySeconds: i * STAGGER_SECONDS,
      deduplicationId: `wf_time_triggers_${subAccountId}_${runTag}`,
    });
    if (result) scheduled += 1;
  }

  return NextResponse.json({
    ok: true,
    candidates: subAccountIds.length,
    scheduled,
  });
}
