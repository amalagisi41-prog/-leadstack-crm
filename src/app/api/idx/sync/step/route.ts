import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { syncIdxListings } from "@/lib/idx/sync";

/**
 * QStash callback — syncs one sub-account's listings. Fanned out by
 * /api/cron/idx-listing-sync (the scheduled job) or triggered directly by
 * the operator's "Sync now" button hitting /api/sub-accounts/[id]/idx/sync.
 *
 * `syncIdxListings` re-checks the agency gate + connection itself (a
 * sub-account could be disabled between scheduling and this callback
 * firing), so this route just verifies the signature and delegates. Always
 * returns 200 — a failed sync is recorded on idxConfig, not retried via a
 * 5xx (IDX Broker rate limits mean a QStash retry storm would make things
 * worse, not better).
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

  const result = await syncIdxListings(subAccountId);
  return NextResponse.json({ ok: result.ok, listingCount: result.listingCount, error: result.error });
}
