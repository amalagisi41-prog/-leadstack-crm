import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  qstashIsConfigured,
  verifyQStashSignature,
} from "@/lib/automations/qstash";
import { emailIsConfigured } from "@/lib/comms/resend";
import { sendGitpageReminderEmail } from "@/lib/gitpage/reminder-email";
import {
  REMINDER_EXCLUSION_SET,
  SHARED_FALLBACK_CODE,
} from "@/lib/gitpage/reminder-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * QStash callback: fires ~3 days after a purchase and sends the Gitpage
 * Agency bonus reminder (unless the buyer was already reminded by the
 * one-off blast, is on the exclusion list, or has no code/email).
 *
 * Scheduled from the Stripe webhook at purchase time. Security is the
 * Upstash-Signature header (route is in PUBLIC_PATH_PATTERNS). Idempotent
 * on `gitpageReminderSentAt`.
 */
export async function POST(request: Request) {
  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "QStash not configured" }, { status: 503 });
  }
  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const rawBody = await request.text();
  if (!(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { sessionId?: string };
  try {
    payload = JSON.parse(rawBody) as { sessionId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sessionId = payload.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("purchases").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, ignored: "missing" });
  }
  const data = snap.data() as {
    email?: string;
    gitpageAgencyCode?: string | null;
    gitpageReminderSentAt?: unknown;
  };

  // Idempotency — already reminded (one-off blast or a prior fire).
  if (data.gitpageReminderSentAt) {
    return NextResponse.json({ ok: true, ignored: "already_reminded" });
  }

  const email = typeof data.email === "string" ? data.email.trim() : "";
  if (!email) return NextResponse.json({ ok: true, ignored: "no_email" });
  if (REMINDER_EXCLUSION_SET.has(email.toLowerCase())) {
    return NextResponse.json({ ok: true, ignored: "excluded" });
  }

  if (!emailIsConfigured()) {
    // 503 → let QStash retry once email infra is back.
    return NextResponse.json({ error: "email not configured" }, { status: 503 });
  }

  const personalCode =
    typeof data.gitpageAgencyCode === "string"
      ? data.gitpageAgencyCode.trim()
      : "";
  const personalized = personalCode.length > 0;
  const code = personalized ? personalCode : SHARED_FALLBACK_CODE;

  let messageId: string | null = null;
  try {
    messageId = await sendGitpageReminderEmail({ to: email, code, personalized });
  } catch (err) {
    // 503 so QStash retries the send (no stamp written → safe re-send).
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "send failed" },
      { status: 503 },
    );
  }

  // Send succeeded — stamp. If the stamp write fails we still return 200
  // (the email already went out; retrying would double-send).
  try {
    await ref.update({
      gitpageReminderSentAt: FieldValue.serverTimestamp(),
      gitpageReminderMessageId: messageId ?? null,
      gitpageReminderCodeType: personalized ? "personal" : "shared",
      gitpageReminderVia: "auto-3day",
    });
  } catch (err) {
    console.error(
      `[gitpage-reminder/step] stamp failed (email sent) sessionId=${sessionId}`,
      err,
    );
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    codeType: personalized ? "personal" : "shared",
  });
}
