import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { evaluateTimeTriggersForSubAccount } from "@/lib/workflows/time-triggers";

/**
 * QStash callback — evaluates the 3 time-based Smart Workflows triggers for
 * one sub-account. Fanned out by /api/cron/workflow-time-triggers (the daily
 * schedule). `evaluateTimeTriggersForSubAccount` never throws, so this route
 * always returns 200 — a bad sub-account can't retry-storm the batch.
 */
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

  let body: { subAccountId?: string };
  try {
    body = JSON.parse(rawBody) as { subAccountId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const subAccountId = body.subAccountId;
  if (!subAccountId) {
    return NextResponse.json(
      { error: "subAccountId is required" },
      { status: 400 },
    );
  }

  const result = await evaluateTimeTriggersForSubAccount(subAccountId);
  return NextResponse.json({ ok: true, ...result });
}
