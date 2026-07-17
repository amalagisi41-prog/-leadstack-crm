import "server-only";

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  qstashIsConfigured,
  verifyQStashSignature,
} from "@/lib/automations/qstash";
import { emailIsConfigured } from "@/lib/comms/resend";
import { sendClaimReminderEmail } from "@/lib/stripe/claim-reminder-email";
import { CLAIM_TOKEN_TTL_SECONDS } from "@/lib/checkout/claim-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * QStash callback: fires ~24h after a new-agency Stripe checkout completes
 * and sends a "finish setting up your workspace" reminder if the buyer
 * hasn't claimed yet. Re-mints the claim token (extending the window
 * another CLAIM_TOKEN_TTL_SECONDS from now) rather than resending the
 * original — the original is a one-time-use, time-boxed secret by design.
 *
 * Scheduled from the Stripe webhook at purchase time. Security is the
 * Upstash-Signature header (route is in PUBLIC_PATH_PATTERNS). Idempotent
 * on `claimReminderSentAt`.
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
    mode?: string;
    claimed?: boolean;
    claimReminderSentAt?: unknown;
  };

  if (data.mode !== "new_agency") {
    return NextResponse.json({ ok: true, ignored: "wrong_mode" });
  }
  if (data.claimed) {
    return NextResponse.json({ ok: true, ignored: "already_claimed" });
  }
  if (data.claimReminderSentAt) {
    return NextResponse.json({ ok: true, ignored: "already_reminded" });
  }
  const email = typeof data.email === "string" ? data.email.trim() : "";
  if (!email) return NextResponse.json({ ok: true, ignored: "no_email" });

  if (!emailIsConfigured()) {
    // 503 → let QStash retry once email infra is back.
    return NextResponse.json({ error: "email not configured" }, { status: 503 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 503 });
  }

  // Re-mint: a fresh raw token, only its hash persisted, same shape as the
  // original mint in lib/stripe/webhooks.ts::handleNewAgencyCheckout.
  // Stored BEFORE sending — the emailed link is only ever valid once the
  // hash backing it is actually persisted, so this must not be reordered
  // after the send the way the gitpage reminder's idempotency stamp is.
  const rawToken = crypto.randomBytes(32).toString("hex");
  const claimTokenHash = crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
  const claimUrl = `${baseUrl}/welcome?session_id=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(rawToken)}`;

  await ref.update({
    claimTokenHash,
    claimExpiresAt: Timestamp.fromMillis(Date.now() + CLAIM_TOKEN_TTL_SECONDS * 1000),
  });

  let messageId: string | null = null;
  try {
    messageId = await sendClaimReminderEmail({ to: email, claimUrl });
  } catch (err) {
    // 503 so QStash retries — a retry just re-mints again, which is fine
    // since the token stored above was never emailed.
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "send failed" },
      { status: 503 },
    );
  }

  // Send succeeded — stamp. If the stamp write fails we still return 200
  // (the email already went out with a valid link; retrying would just
  // re-mint and resend a second, equally valid reminder).
  try {
    await ref.update({
      claimReminderSentAt: FieldValue.serverTimestamp(),
      claimReminderMessageId: messageId ?? null,
    });
  } catch (err) {
    console.error(
      `[claim-reminder/step] stamp failed (email sent) sessionId=${sessionId}`,
      err,
    );
  }

  return NextResponse.json({ ok: true, sent: true });
}
