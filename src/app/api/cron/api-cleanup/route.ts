import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";

/**
 * Daily cleanup sweep for the public API's TTL'd collections.
 *
 * Replaces Firestore native TTL policies — those would require the buyer
 * to click into the Firebase console after cloning, which breaks the
 * "configure env vars, run firebase deploy --only firestore:rules, done"
 * onboarding model. This route does the same job using infrastructure
 * the buyer is already configuring (QStash).
 *
 * Wiring (one-time, in the QStash dashboard):
 *   Schedule: cron `0 4 * * *` (or any daily slot)
 *   Target:   ${NEXT_PUBLIC_APP_URL}/api/cron/api-cleanup
 *
 * Cost: at moderate API volume (~50k requests/month) this sweep deletes
 * ~50k apiRequestLogs/month + smaller volumes of apiIdempotency and
 * webhookEvents. Total ~$0.06/month in Firestore ops — same ballpark as
 * native TTL would cost (TTL also bills 1 delete per doc).
 *
 * Continuation: if any collection hits the per-run cap, the route
 * self-schedules a re-run in 60s. Caps the function execution time well
 * under Vercel's serverless timeout and prevents tablet-hot issues from
 * batch-deleting 100k docs in one shot.
 */

const BATCH_LIMIT = 500;
const CONTINUATION_DELAY_SEC = 60;

interface SweepResult {
  collection: string;
  deleted: number;
  hitCap: boolean;
}

async function sweepFlatCollection(
  collectionGroupName: string,
  now: Date,
): Promise<SweepResult> {
  const db = getAdminDb();
  const snap = await db
    .collectionGroup(collectionGroupName)
    .where("expiresAt", "<", now)
    .limit(BATCH_LIMIT)
    .get();
  if (snap.empty) {
    return { collection: collectionGroupName, deleted: 0, hitCap: false };
  }
  // Firestore batch limit is 500 ops; we already capped at BATCH_LIMIT.
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  return {
    collection: collectionGroupName,
    deleted: snap.size,
    hitCap: snap.size >= BATCH_LIMIT,
  };
}

async function sweepWebhookEvents(now: Date): Promise<SweepResult> {
  // webhookEvents has a `deliveries/{id}` subcollection. recursiveDelete
  // is the only safe way to remove the parent — a batch delete would
  // orphan the deliveries.
  const db = getAdminDb();
  const snap = await db
    .collectionGroup("webhookEvents")
    .where("expiresAt", "<", now)
    .limit(BATCH_LIMIT)
    .get();
  if (snap.empty) {
    return { collection: "webhookEvents", deleted: 0, hitCap: false };
  }
  // recursiveDelete on each ref — Firestore Admin SDK throttles internally
  // to avoid hot-tablet writes. Sequential per doc keeps memory bounded;
  // for our volume this is fine. If sweep volume grows past 5k/day we'd
  // want to fan-out via QStash + parallelize. Track via the response
  // counts before that's a real concern.
  let deleted = 0;
  for (const doc of snap.docs) {
    await db.recursiveDelete(doc.ref);
    deleted += 1;
  }
  return {
    collection: "webhookEvents",
    deleted,
    hitCap: snap.size >= BATCH_LIMIT,
  };
}

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

  const startedAt = Date.now();
  const now = new Date();

  // Run all three sweeps sequentially. They're independent collection
  // groups but parallelising adds little — each sweep is dominated by
  // the Firestore ops, not CPU.
  const results: SweepResult[] = [];
  try {
    results.push(await sweepFlatCollection("apiRequestLogs", now));
    results.push(await sweepFlatCollection("apiIdempotency", now));
    results.push(await sweepWebhookEvents(now));
  } catch (err) {
    console.error("[cron/api-cleanup] sweep failed", err);
    return NextResponse.json(
      {
        error: "sweep_failed",
        message: err instanceof Error ? err.message : "unknown",
        partial: results,
      },
      { status: 500 },
    );
  }

  const anyHitCap = results.some((r) => r.hitCap);

  // If any sweep maxed out its batch, more work is waiting. Self-schedule
  // a continuation so we keep draining without a long-running invocation.
  // The daily schedule will pick up tomorrow's work; this short-window
  // re-run is only for catching up after a spike.
  if (anyHitCap) {
    await publishCallback({
      pathname: "/api/cron/api-cleanup",
      body: {},
      delaySeconds: CONTINUATION_DELAY_SEC,
      // Time-based dedup id so multiple continuations within the same
      // minute don't stomp each other but a healthy sweep can land its
      // next run.
      deduplicationId: `api-cleanup_continuation_${Math.floor(Date.now() / 1000 / 60)}`,
    });
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    results,
    continuationScheduled: anyHitCap,
  });
}
