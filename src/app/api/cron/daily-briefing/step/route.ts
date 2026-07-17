import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { sendDailyBriefingForSubAccount } from "@/lib/briefing/send";

/**
 * QStash callback — evaluates + (maybe) sends the Daily Briefing for one
 * sub-account. Fanned out by /api/cron/daily-briefing (the hourly schedule).
 * `sendDailyBriefingForSubAccount` never throws, so this route always
 * returns 200 — a bad sub-account can't retry-storm the batch.
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

  const result = await sendDailyBriefingForSubAccount(subAccountId);
  return NextResponse.json({ ok: true, ...result });
}
