import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUid } from "@/lib/comms/route-auth";
import { emailIsConfigured } from "@/lib/comms/resend";
import { sendGitpageReminderEmail } from "@/lib/gitpage/reminder-email";
import {
  REMINDER_EXCLUSIONS,
  SHARED_FALLBACK_CODE,
} from "@/lib/gitpage/reminder-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One-off owner-gated blast: remind every buyer who was issued a Gitpage
 * Agency bonus code to redeem it before it expires. Reuses each buyer's
 * stored `gitpageAgencyCode` (no re-mint).
 *
 * Safety:
 *  - Agency-owner only (caller email must equal BOOTSTRAP_ADMIN_EMAIL).
 *  - DEFAULTS TO A TEST SEND (`{ test: true }` implied) — one preview email
 *    to the owner with a sample code. Pass `{ "test": false }` to run for
 *    real.
 *  - Idempotent: the real run skips any purchase already stamped
 *    `gitpageReminderSentAt`, and stamps it after a successful send, so a
 *    re-run never double-emails.
 *
 * Body: { test?: boolean }  (test defaults to true)
 */

const SAMPLE_CODE = "LEADSTACK-PREVIEW1";
// SHARED_FALLBACK_CODE + the exclusion list live in reminder-config.ts so
// the automated 3-day reminder shares them.
const HARDCODED_EXCLUSIONS = REMINDER_EXCLUSIONS;

export async function POST(request: Request) {
  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;

  // Agency-owner gate.
  const owner = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!owner || auth.email.trim().toLowerCase() !== owner) {
    return NextResponse.json(
      { error: "Owner only." },
      { status: 403 },
    );
  }

  if (!emailIsConfigured()) {
    return NextResponse.json(
      { error: "Email isn't configured (RESEND_API_KEY / EMAIL_FROM)." },
      { status: 503 },
    );
  }

  let body: { test?: boolean; exclude?: string[] } = {};
  try {
    body = (await request.json()) as { test?: boolean; exclude?: string[] };
  } catch {
    /* empty body is fine — defaults to test */
  }
  // Default to a test send unless explicitly disabled.
  const isTest = body.test !== false;

  // Emails to skip entirely (case-insensitive). Merge any baked-in list
  // with the per-request list passed in the body.
  const excludeSet = new Set<string>(
    [...HARDCODED_EXCLUSIONS, ...(body.exclude ?? [])]
      .filter((e): e is string => typeof e === "string")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

  // ---- TEST: two preview emails to the owner (personalized + shared
  // fallback variant), no DB writes. ----
  if (isTest) {
    try {
      const personalId = await sendGitpageReminderEmail({
        to: auth.email,
        code: SAMPLE_CODE,
        personalized: true,
      });
      const sharedId = await sendGitpageReminderEmail({
        to: auth.email,
        code: SHARED_FALLBACK_CODE,
        personalized: false,
      });
      return NextResponse.json({
        ok: true,
        mode: "test",
        sentTo: auth.email,
        messageIds: { personalized: personalId, shared: sharedId },
        note: 'Two previews sent (personal sample code + shared LSAGENCY variant). No buyers emailed. POST { "test": false } to run for real.',
      });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Send failed",
        },
        { status: 502 },
      );
    }
  }

  // ---- REAL RUN ----
  // All buyers: those with their own code get it; those without get the
  // shared LSAGENCY fallback (so all 70 are covered).
  const db = getAdminDb();
  const snap = await db.collection("purchases").get();

  let sentPersonal = 0;
  let sentShared = 0;
  let skipped = 0;
  let excluded = 0;
  let failed = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const doc of snap.docs) {
    const data = doc.data() as {
      email?: string;
      gitpageAgencyCode?: string | null;
      gitpageReminderSentAt?: unknown;
    };
    const email = typeof data.email === "string" ? data.email.trim() : "";

    // No email to send to → skip.
    if (!email) {
      skipped += 1;
      continue;
    }
    // Operator exclusion list.
    if (excludeSet.has(email.toLowerCase())) {
      excluded += 1;
      continue;
    }
    // Idempotency — already reminded.
    if (data.gitpageReminderSentAt) {
      skipped += 1;
      continue;
    }

    const personalCode =
      typeof data.gitpageAgencyCode === "string"
        ? data.gitpageAgencyCode.trim()
        : "";
    const personalized = personalCode.length > 0;
    const code = personalized ? personalCode : SHARED_FALLBACK_CODE;

    try {
      const messageId = await sendGitpageReminderEmail({
        to: email,
        code,
        personalized,
      });
      await doc.ref.update({
        gitpageReminderSentAt: FieldValue.serverTimestamp(),
        gitpageReminderMessageId: messageId ?? null,
        gitpageReminderCodeType: personalized ? "personal" : "shared",
      });
      if (personalized) sentPersonal += 1;
      else sentShared += 1;
    } catch (err) {
      failed += 1;
      failures.push({
        id: doc.id,
        error: err instanceof Error ? err.message : "Send failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "live",
    candidates: snap.size,
    sent: sentPersonal + sentShared,
    sentPersonal,
    sentShared,
    excluded,
    excludeListSize: excludeSet.size,
    skipped,
    failed,
    failures: failures.slice(0, 25),
  });
}
