import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { syncListingsFromSource } from "@/lib/marketing/listings-source-sync";

/**
 * QStash callback — re-syncs one of a sub-account's connected listings
 * pages. Fanned out by /api/cron/listings-source-sync (the weekly
 * schedule) or triggered directly by the operator's "Sync now" / connect
 * action, which calls `syncListingsFromSource` inline instead of
 * round-tripping through QStash (see the listings-sources routes). Always
 * returns 200 — a failed scrape is recorded on the source doc, not retried
 * via a 5xx.
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

  let body: { subAccountId?: string; sourceId?: string };
  try {
    body = JSON.parse(rawBody) as { subAccountId?: string; sourceId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { subAccountId, sourceId } = body;
  if (!subAccountId || !sourceId) {
    return NextResponse.json(
      { error: "subAccountId and sourceId are required" },
      { status: 400 },
    );
  }

  const result = await syncListingsFromSource(subAccountId, sourceId);
  return NextResponse.json({
    ok: result.ok,
    propertyCount: result.propertyCount,
    error: result.error,
  });
}
