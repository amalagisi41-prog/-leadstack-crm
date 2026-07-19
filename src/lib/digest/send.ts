import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { sendEmail, emailIsConfigured, tenantFrom } from "@/lib/comms/resend";
import { CUSTOM_BRAND } from "@/config/landing";
import { compileWeeklyDigest } from "@middleware/digest/compile";
import { renderWeeklyDigestEmail } from "./email";
import { toMillis } from "@/lib/briefing/compute";
import type { SubAccountDoc } from "@/types";
import type { WorkflowNodeType } from "@/types/workflows";

/**
 * Weekly Digest orchestrator — "Your AI employee this week: X replies, Y
 * bookings, Z leads revived." Fired once a week by the
 * "agentstack-weekly-digest" QStash schedule (fixed UTC time, unlike the
 * Daily Briefing's per-timezone hourly sweep) via
 * /api/cron/weekly-digest -> /api/cron/weekly-digest/step, one call per
 * sub-account. Reuses `dailyBriefingEnabled` as its opt-in toggle — no
 * separate settings UI, same posture the daily briefing already ships.
 *
 * Never throws — a bad sub-account can't break the sweep for anyone else.
 */

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Re-send guard: skip if the last digest went out less than this long ago.
 *  Slightly under 7 days so a schedule that drifts an hour or two week to
 *  week can't skip a cycle, while still blocking an accidental double-fire
 *  within the same week. */
const MIN_RESEND_GAP_MS = 6 * 24 * 60 * 60 * 1000;

const SEND_NODE_TYPES: ReadonlySet<WorkflowNodeType> = new Set([
  "send_sms",
  "send_email",
  "whatsapp_template",
  "google_review_request",
]);

const COLD_LEAD_TEMPLATE_KEY = "cold-lead-90-day-revival";

export interface SendDigestResult {
  sent: boolean;
  reason?: string;
  recipientCount?: number;
}

export async function sendWeeklyDigestForSubAccount(
  subAccountId: string,
): Promise<SendDigestResult> {
  try {
    const db = getAdminDb();
    const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    if (!subSnap.exists) return { sent: false, reason: "sub_account_not_found" };
    const sub = subSnap.data() as SubAccountDoc;

    if (sub.dailyBriefingEnabled !== true) {
      return { sent: false, reason: "not_enabled" };
    }

    const nowMs = Date.now();
    const lastSentMs = sub.lastDigestSentAt ? Date.parse(sub.lastDigestSentAt) : NaN;
    if (!Number.isNaN(lastSentMs) && nowMs - lastSentMs < MIN_RESEND_GAP_MS) {
      return { sent: false, reason: "already_sent_this_week" };
    }

    if (!emailIsConfigured()) {
      return { sent: false, reason: "email_not_configured" };
    }

    const membersSnap = await db
      .collection(`subAccounts/${subAccountId}/subAccountMembers`)
      .where("status", "==", "active")
      .where("role", "==", "admin")
      .get();
    const recipients = [
      ...new Set(
        membersSnap.docs
          .map((d) => (d.data().email as string | undefined)?.trim())
          .filter((e): e is string => !!e),
      ),
    ];
    if (recipients.length === 0) {
      return { sent: false, reason: "no_admin_recipients" };
    }

    const windowStartMs = nowMs - WINDOW_MS;

    const [runsSnap, eventsSnap, dealsSnap, coldLeadWorkflowSnap] = await Promise.all([
      db.collection("workflowRuns").where("subAccountId", "==", subAccountId).get(),
      db.collection("events").where("subAccountId", "==", subAccountId).get(),
      db.collection("deals").where("subAccountId", "==", subAccountId).get(),
      // Two equality filters — no composite index required (same reasoning
      // as the (subAccountId, contactId) query in time-triggers.ts).
      db
        .collection("workflows")
        .where("subAccountId", "==", subAccountId)
        .where("templateKey", "==", COLD_LEAD_TEMPLATE_KEY)
        .get(),
    ]);

    const coldLeadWorkflowIds = new Set(coldLeadWorkflowSnap.docs.map((d) => d.id));

    let repliesSent = 0;
    const revivedContactIds = new Set<string>();
    for (const doc of runsSnap.docs) {
      const data = doc.data();
      const history = Array.isArray(data.history) ? data.history : [];
      for (const entry of history) {
        if (!SEND_NODE_TYPES.has(entry?.type)) continue;
        if (entry?.result !== "ok") continue;
        const atMs = toMillis(entry?.at);
        if (atMs === null || atMs < windowStartMs) continue;
        repliesSent += 1;
      }
      if (coldLeadWorkflowIds.has(data.workflowId as string)) {
        const enrolledMs = toMillis(data.enrolledAt);
        if (enrolledMs !== null && enrolledMs >= windowStartMs) {
          revivedContactIds.add(data.contactId as string);
        }
      }
    }

    let bookingsCreated = 0;
    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      if (data.source !== "booking_page") continue;
      const createdMs = toMillis(data.createdAt);
      if (createdMs === null || createdMs < windowStartMs) continue;
      bookingsCreated += 1;
    }

    let dealsWon = 0;
    let dealsWonValue = 0;
    for (const doc of dealsSnap.docs) {
      const data = doc.data();
      if (data.stageId !== "won") continue;
      const changedMs = toMillis(data.stageChangedAt);
      if (changedMs === null || changedMs < windowStartMs) continue;
      dealsWon += 1;
      dealsWonValue += (data.value as number) ?? 0;
    }

    const digest = compileWeeklyDigest({
      repliesSent,
      bookingsCreated,
      leadsRevived: revivedContactIds.size,
      dealsWon,
      dealsWonValue,
    });

    // A quiet week still stamps the dedup marker (so it doesn't re-evaluate
    // every day until the schedule fires again) but skips the send — no
    // activity to report doesn't warrant an email.
    await db.doc(`subAccounts/${subAccountId}`).set(
      { lastDigestSentAt: new Date().toISOString() },
      { merge: true },
    );

    if (digest.isEmpty) {
      return { sent: false, reason: "nothing_to_report" };
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const saPath = (p: string) => `${baseUrl}/sa/${subAccountId}${p}`;
    const { subject, text, html } = renderWeeklyDigestEmail({
      businessName: sub.name || CUSTOM_BRAND.name,
      digest,
      dashboardUrl: saPath("/dashboard"),
    });

    let sentCount = 0;
    for (const to of recipients) {
      try {
        await sendEmail({ to, subject, text, html, from: tenantFrom(sub) });
        sentCount += 1;
      } catch (err) {
        console.warn("[digest] send failed", subAccountId, to, err);
      }
    }

    return {
      sent: sentCount > 0,
      reason: sentCount > 0 ? undefined : "all_sends_failed",
      recipientCount: sentCount,
    };
  } catch (err) {
    console.error("[digest] sendWeeklyDigestForSubAccount failed", subAccountId, err);
    return { sent: false, reason: "error" };
  }
}
