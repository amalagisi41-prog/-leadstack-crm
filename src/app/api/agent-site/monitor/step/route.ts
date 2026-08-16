import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { inspectHostedSiteHtml } from "@/lib/website-studio/dom-health";
import type { AgentSiteDoc } from "@/types/agent-site";

export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature || !(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const body = JSON.parse(rawBody) as { subAccountId?: string };
  if (!body.subAccountId)
    return NextResponse.json(
      { error: "Missing subAccountId" },
      { status: 400 }
    );
  const ref = getAdminDb().doc(
    `subAccounts/${body.subAccountId}/agentSites/main`
  );
  const snap = await ref.get();
  if (!snap.exists)
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const site = snap.data() as AgentSiteDoc;
  if (site.status !== "published")
    return NextResponse.json({ ok: true, skipped: "draft" });
  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (!origin)
    return NextResponse.json(
      { error: "Application URL is not configured" },
      { status: 503 }
    );
  const url = new URL(
    `/agent/${body.subAccountId}/${site.slug}`,
    origin
  ).toString();
  let status = 0;
  let health = inspectHostedSiteHtml("");
  let error: string | null = null;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    status = response.status;
    health = inspectHostedSiteHtml(await response.text());
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Monitor request failed";
  }
  const passed = status === 200 && health.passed;
  await ref.update({
    releaseMonitor: {
      passed,
      status,
      url,
      error,
      checks: health.checks,
      checkedAt: FieldValue.serverTimestamp(),
    },
  });
  return NextResponse.json({ ok: true, passed, status, health, error });
}
