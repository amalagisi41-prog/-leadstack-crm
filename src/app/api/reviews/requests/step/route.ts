import "server-only";

import { NextResponse } from "next/server";
import { qstashIsConfigured, verifyQStashSignature } from "@/lib/automations/qstash";
import { runQueuedReviewRequest } from "@/lib/reviews/log";

export const dynamic = "force-dynamic";

/**
 * QStash callback: runs one queued post-closing review request at its delayed
 * send time (log-only dry run or live send, by the mode in force NOW).
 * Public path — security is the Upstash-Signature check. Always 200 once
 * verified: the outcome is written to the request's log, never retried blind.
 */
export async function POST(request: Request) {
  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "Scheduling is not configured." }, { status: 503 });
  }
  const signature = request.headers.get("upstash-signature");
  const raw = await request.text();
  if (!signature || !(await verifyQStashSignature(signature, raw))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let requestId: string | undefined;
  try {
    requestId = (JSON.parse(raw) as { requestId?: string }).requestId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });
  try {
    await runQueuedReviewRequest(requestId);
  } catch (err) {
    console.error("[reviews/step] failed", requestId, err);
    // 500 so QStash retries a transient failure; the run is idempotent.
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
