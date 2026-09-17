import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { refreshMetaConnection } from "@/lib/comms/meta-refresh";

/**
 * QStash callback for one sub-account's Meta token refresh, fanned out by
 * /api/cron/meta-token-refresh. Always returns 200 — a failed refresh flags
 * `metaConfig.needsReconnect` (see lib/comms/meta-refresh.ts) rather than
 * needing a retry; QStash retrying a refresh doesn't change the outcome.
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

  let subAccountId: string | undefined;
  try {
    const body = JSON.parse(rawBody) as { subAccountId?: string };
    subAccountId = body.subAccountId;
  } catch {
    // fall through — handled by the missing-id check below
  }
  if (!subAccountId) {
    return NextResponse.json({ error: "Missing subAccountId" }, { status: 400 });
  }

  const result = await refreshMetaConnection(subAccountId);
  return NextResponse.json({ ok: result.ok, reason: result.reason });
}
