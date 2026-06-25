import "server-only";

import { NextResponse } from "next/server";
import {
  qstashIsConfigured,
  verifyQStashSignature,
} from "@/lib/automations/qstash";
import { runStep } from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";

/**
 * Workflow step worker — QStash callback that advances one node of a run.
 * Public path; security is the Upstash signature. 5xx → QStash retries (the
 * engine is idempotent on the run's history); 2xx/4xx are terminal.
 */
export async function POST(request: Request) {
  if (!qstashIsConfigured()) {
    return NextResponse.json(
      { error: "QStash is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const rawBody = await request.text();
  if (!(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { runId?: string; nodeId?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof payload.runId !== "string" || typeof payload.nodeId !== "string") {
    return NextResponse.json(
      { error: "Body must include runId + nodeId" },
      { status: 400 },
    );
  }

  try {
    await runStep(payload.runId, payload.nodeId);
  } catch (err) {
    console.error("[workflows/step] threw", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Step failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
