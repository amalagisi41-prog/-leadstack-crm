import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";

/**
 * Fired weekly by the "agentstack-listings-source-sync" QStash schedule
 * (see lib/qstash/register-schedules.ts). Fans out one staggered callback
 * per sub-account with a connected listings page to
 * /api/listings-source-sync/step, mirroring the IDX listing sync fan-out.
 * Weekly rather than every 6 hours like IDX — a public listings page for
 * one agent's own site doesn't turn over anywhere near as often as an MLS
 * feed, and re-scraping is the heavier operation of the two.
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
  // One singleton doc per sub-account, so a small collectionGroup scan
  // (no composite index needed) is filtered in JS rather than in a query.
  const snap = await db.collectionGroup("listingsImportSource").get();
  const targets = snap.docs.filter(
    (doc) => typeof doc.data().url === "string" && doc.data().url,
  );

  const runTag = Math.floor(Date.now() / 1000);
  let scheduled = 0;
  for (let i = 0; i < targets.length; i++) {
    // subAccounts/{id}/listingsImportSource/main -> {id} is the parent's parent.
    const subAccountId = targets[i].ref.parent.parent?.id;
    if (!subAccountId) continue;
    const result = await publishCallback({
      pathname: "/api/listings-source-sync/step",
      body: { subAccountId },
      delaySeconds: i * STAGGER_SECONDS,
      deduplicationId: `listings_source_sync_${subAccountId}_${runTag}`,
    });
    if (result) scheduled += 1;
  }

  return NextResponse.json({ ok: true, candidates: targets.length, scheduled });
}
