import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  qstashIsConfigured,
  verifyQStashSignature,
} from "@/lib/automations/qstash";
import {
  fetchApprovalStatus,
  WhatsappContentError,
} from "@/lib/comms/whatsapp/templates-api";
import type { SubAccountDoc } from "@/types";
import type {
  WhatsappTemplateDoc,
  WhatsappTemplateStatus,
} from "@/types/whatsapp-templates";

export const dynamic = "force-dynamic";

/**
 * QStash callback that polls Twilio for a template's WhatsApp approval status.
 * Mirrors the website-builder poll, with a backoff tail: tight 20s polling
 * for the first ~5 minutes (approvals are usually quick), then 5-minute ticks
 * out to a few hours, since Meta can occasionally take longer. At the cap we
 * stop and leave the template "pending" (re-submitting re-arms the poll).
 */

const FAST_INTERVAL_SECONDS = 20;
const SLOW_INTERVAL_SECONDS = 300;
const FAST_ATTEMPTS = 15; // ~5 min at 20s
const MAX_POLL_ATTEMPTS = 60; // ~5 min + ~3.75h

interface PollPayload {
  subAccountId?: string;
  templateId?: string;
  contentSid?: string;
}

function delayForAttempt(attempt: number): number {
  return attempt < FAST_ATTEMPTS ? FAST_INTERVAL_SECONDS : SLOW_INTERVAL_SECONDS;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;

  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "QStash is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Upstash-Signature header" }, { status: 401 });
  }
  const rawBody = await request.text();
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PollPayload;
  try {
    payload = JSON.parse(rawBody) as PollPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    payload.subAccountId !== subAccountId ||
    typeof payload.templateId !== "string" ||
    typeof payload.contentSid !== "string"
  ) {
    return NextResponse.json(
      { error: "Body must include subAccountId + templateId + contentSid" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const ref = db.doc(
    `subAccounts/${subAccountId}/whatsappTemplates/${payload.templateId}`,
  );
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, ignored: "doc-missing" });
  }
  const tpl = snap.data() as WhatsappTemplateDoc;

  // Bail if we're no longer chasing this approval (re-submitted with a new
  // contentSid, or already settled).
  if (tpl.status !== "pending" || tpl.contentSid !== payload.contentSid) {
    return NextResponse.json({ ok: true, ignored: "stale-tick" });
  }

  const attempts = (tpl.pollAttempts ?? 0) + 1;
  if (attempts > MAX_POLL_ATTEMPTS) {
    // Leave it pending — Meta may still decide. The operator can re-submit to
    // re-arm the poll. Record the attempt so the UI can show "still pending".
    await ref.update({
      pollAttempts: attempts,
      lastSyncedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "timeout" });
  }

  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const cfg = (subSnap.data() as SubAccountDoc | undefined)?.twilioConfig ?? null;
  if (!cfg?.accountSid || !cfg.authToken) {
    // Creds disappeared — stop chasing.
    await ref.update({
      status: "failed",
      rejectionReason: "Twilio credentials are no longer configured.",
      pollAttempts: attempts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "no-creds" });
  }

  let result;
  try {
    result = await fetchApprovalStatus({
      accountSid: cfg.accountSid,
      authToken: cfg.authToken,
      contentSid: payload.contentSid,
    });
  } catch (err) {
    // 4xx = terminal (content gone / bad request); 5xx + network = retry.
    if (err instanceof WhatsappContentError && err.status >= 400 && err.status < 500) {
      await ref.update({
        status: "failed",
        rejectionReason: `Approval lookup failed: ${err.message}`,
        pollAttempts: attempts,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true, settled: "client-error" });
    }
    console.warn("[whatsapp-templates/poll] status fetch threw — rescheduling", err);
    await ref.update({
      pollAttempts: attempts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await reschedule(subAccountId, payload.templateId, payload.contentSid, attempts);
    return NextResponse.json({ ok: true, deferred: "transient" });
  }

  // Terminal states.
  const terminal: Partial<Record<typeof result.status, WhatsappTemplateStatus>> = {
    approved: "approved",
    rejected: "rejected",
    paused: "paused",
    disabled: "disabled",
  };
  const mapped = terminal[result.status];
  if (mapped) {
    await ref.update({
      status: mapped,
      rejectionReason: mapped === "rejected" ? result.rejectionReason : null,
      pollAttempts: attempts,
      lastSyncedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(mapped === "approved" ? { approvedAt: FieldValue.serverTimestamp() } : {}),
    });
    return NextResponse.json({ ok: true, settled: mapped });
  }

  // Still pending (or unknown — treat as pending). Bump + reschedule.
  await ref.update({
    pollAttempts: attempts,
    lastSyncedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await reschedule(subAccountId, payload.templateId, payload.contentSid, attempts);
  return NextResponse.json({ ok: true, deferred: "pending" });
}

async function reschedule(
  subAccountId: string,
  templateId: string,
  contentSid: string,
  attempts: number,
): Promise<void> {
  await publishCallback({
    pathname: `/api/sub-accounts/${subAccountId}/whatsapp-templates/poll`,
    body: { subAccountId, templateId, contentSid },
    delaySeconds: delayForAttempt(attempts),
    deduplicationId: `watpl_${subAccountId}_${templateId}_${attempts}`,
  });
}
