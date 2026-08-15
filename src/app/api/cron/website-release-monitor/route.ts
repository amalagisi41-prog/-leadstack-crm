import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";

export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature || !(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const snap = await getAdminDb()
    .collectionGroup("agentSites")
    .where("status", "==", "published")
    .limit(500)
    .get();
  let scheduled = 0;
  const run = Math.floor(Date.now() / (15 * 60 * 1000));
  for (let index = 0; index < snap.docs.length; index += 1) {
    const subAccountId = snap.docs[index].ref.parent.parent?.id;
    if (!subAccountId) continue;
    const result = await publishCallback({
      pathname: "/api/agent-site/monitor/step",
      body: { subAccountId },
      delaySeconds: index * 2,
      deduplicationId: `website_monitor_${subAccountId}_${run}`,
    });
    if (result) scheduled += 1;
  }
  return NextResponse.json({ ok: true, candidates: snap.size, scheduled });
}
