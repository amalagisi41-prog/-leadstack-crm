import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { syncListingsFromSource } from "@/lib/marketing/listings-source-sync";

/**
 * QStash callback — re-syncs one sub-account's connected listings page.
 * Fanned out by /api/cron/listings-source-sync (the weekly schedule) or
 * triggered directly by the operator's "Sync now" / connect action, which
 * calls `syncListingsFromSource` inline instead of round-tripping through
 * QStash (see the listings-source route). Always returns 200 — a failed
 * scrape is recorded on the source doc, not retried via a 5xx.
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
    return NextResponse.json({ error: "subAccountId is required" }, { status: 400 });
  }

  const result = await syncListingsFromSource(subAccountId);
  return NextResponse.json({
    ok: result.ok,
    propertyCount: result.propertyCount,
    error: result.error,
  });
}
