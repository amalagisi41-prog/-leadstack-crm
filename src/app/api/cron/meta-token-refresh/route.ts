import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";
import type { MetaConfig } from "@/types/tenancy";

/**
 * Fired weekly by the "agentstack-meta-token-refresh" QStash schedule (see
 * lib/qstash/register-schedules.ts). Fans out one staggered callback per
 * connected Meta (Facebook/Instagram) sub-account to
 * /api/cron/meta-token-refresh/step, mirroring the daily-briefing / IDX sync
 * fan-out. This is the automated renewal that keeps the connection open
 * indefinitely instead of the operator having to notice a ~60-day-old token
 * has died and manually reconnect — see lib/comms/meta-refresh.ts.
 *
 * No top-level "meta connected" field exists to query directly, so this
 * unions the two gates a connection could have been made under and filters
 * to actually-connected docs in memory — mirrors the idx-listing-sync fan-out
 * shape for the same reason (the field it needs isn't the indexed one).
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
  const [inboxSnap, socialSnap] = await Promise.all([
    db.collection("subAccounts").where("metaInboxEnabledByAgency", "==", true).get(),
    db
      .collection("subAccounts")
      .where("socialPlannerEnabledByAgency", "==", true)
      .get(),
  ]);

  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of [...inboxSnap.docs, ...socialSnap.docs]) byId.set(d.id, d);

  const targets = [...byId.values()].filter(
    (d) => (d.data().metaConfig as MetaConfig | undefined)?.connected === true,
  );

  const runTag = Math.floor(Date.now() / 1000);
  let scheduled = 0;
  for (let i = 0; i < targets.length; i++) {
    const subAccountId = targets[i].id;
    const result = await publishCallback({
      pathname: "/api/cron/meta-token-refresh/step",
      body: { subAccountId },
      delaySeconds: i * STAGGER_SECONDS,
      deduplicationId: `meta_token_refresh_${subAccountId}_${runTag}`,
    });
    if (result) scheduled += 1;
  }

  return NextResponse.json({
    ok: true,
    candidates: targets.length,
    scheduled,
  });
}
