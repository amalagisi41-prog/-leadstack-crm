import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";

/**
 * Fired every 6 hours by the "agentstack-idx-listing-sync" QStash schedule
 * (see lib/qstash/register-schedules.ts). Fans out one staggered callback
 * per IDX-connected sub-account to /api/idx/sync/step, mirroring the
 * broadcasts email send fan-out. Staggering avoids bursting every
 * sub-account's IDX Broker account limits at the same instant.
 */

const STAGGER_SECONDS = 3;

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
    .where("idxEnabledByAgency", "==", true)
    .get();

  const targets = snap.docs.filter(
    (d) => (d.data().idxConfig as { enabled?: boolean } | undefined)?.enabled
  );

  const runTag = Math.floor(Date.now() / 1000);
  let scheduled = 0;
  for (let i = 0; i < targets.length; i++) {
    const subAccountId = targets[i].id;
    const result = await publishCallback({
      pathname: "/api/idx/sync/step",
      body: { subAccountId },
      delaySeconds: i * STAGGER_SECONDS,
      deduplicationId: `idx_sync_${subAccountId}_${runTag}`,
    });
    if (result) scheduled += 1;
  }

  return NextResponse.json({
    ok: true,
    candidates: targets.length,
    scheduled,
  });
}
