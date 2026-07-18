import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendEmail, emailIsConfigured, tenantFrom } from "@/lib/comms/resend";
import { CUSTOM_BRAND } from "@/config/landing";
import { localTimeInfo } from "./local-time";
import { computeBriefingStats, briefingIsEmpty } from "./compute";
import { renderDailyBriefingEmail } from "./email";
import type { SubAccountDoc } from "@/types";

/**
 * Daily Briefing orchestrator. Fanned out hourly by
 * /api/cron/daily-briefing (itself scheduled by the
 * "leadstack-daily-briefing" QStash cron) — one call per opted-in
 * sub-account. Only actually sends once each sub-account's local clock
 * hits TARGET_HOUR, deduped by `lastBriefingSentDate` so the hourly sweep
 * can safely re-check every sub-account every hour without double-sending.
 *
 * Never throws — a bad sub-account can't break the sweep for anyone else,
 * same posture as `evaluateTimeTriggersForSubAccount`.
 */

const TARGET_HOUR = 7;

export interface SendBriefingResult {
  sent: boolean;
  reason?: string;
  recipientCount?: number;
}

export async function sendDailyBriefingForSubAccount(
  subAccountId: string,
): Promise<SendBriefingResult> {
  try {
    const db = getAdminDb();
    const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    if (!subSnap.exists) return { sent: false, reason: "sub_account_not_found" };
    const sub = subSnap.data() as SubAccountDoc;

    if (sub.dailyBriefingEnabled !== true) {
      return { sent: false, reason: "not_enabled" };
    }

    const info = localTimeInfo(sub.timezone, new Date());
    if (info.hour !== TARGET_HOUR) {
      return { sent: false, reason: "not_target_hour" };
    }
    if (sub.lastBriefingSentDate === info.dateKey) {
      return { sent: false, reason: "already_sent_today" };
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

    const [contactsSnap, tasksSnap, dealsSnap, eventsSnap, sessionsSnap] =
      await Promise.all([
        db.collection("contacts").where("subAccountId", "==", subAccountId).get(),
        db.collection("tasks").where("subAccountId", "==", subAccountId).get(),
        db.collection("deals").where("subAccountId", "==", subAccountId).get(),
        db.collection("events").where("subAccountId", "==", subAccountId).get(),
        db
          .collection(`subAccounts/${subAccountId}/webChatSessions`)
          .get(),
      ]);

    const stats = computeBriefingStats({
      contacts: contactsSnap.docs.map((d) => ({ createdAt: d.data().createdAt })),
      tasks: tasksSnap.docs.map((d) => ({
        completed: !!d.data().completed,
        dueAt: d.data().dueAt,
      })),
      deals: dealsSnap.docs.map((d) => ({
        stageId: d.data().stageId as string,
        value: (d.data().value as number) ?? 0,
        stageChangedAt: d.data().stageChangedAt,
      })),
      events: eventsSnap.docs.map((d) => ({ startAt: d.data().startAt })),
      sessions: sessionsSnap.docs.map((d) => ({
        status: d.data().status as string,
      })),
      todayStartMs: info.dayStartMs,
      todayEndMs: info.dayEndMs,
      now: new Date(),
    });

    // A briefing with nothing to report still stamps the dedup marker (so
    // it doesn't re-evaluate all day) but skips the send — an empty inbox
    // doesn't need an email to prove it.
    const shouldSend = !briefingIsEmpty(stats);

    // Stamp the dedup marker BEFORE sending. A partial multi-recipient
    // failure below still counts as "handled today" — we log and move on
    // rather than retry-storm tomorrow's sweep with today's stale content.
    await db.doc(`subAccounts/${subAccountId}`).set(
      { lastBriefingSentDate: info.dateKey, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    if (!shouldSend) {
      return { sent: false, reason: "nothing_to_report" };
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const saPath = (p: string) => `${baseUrl}/sa/${subAccountId}${p}`;
    const { subject, text, html } = renderDailyBriefingEmail({
      businessName: sub.name || CUSTOM_BRAND.name,
      stats,
      dashboardUrl: saPath("/dashboard"),
      tasksUrl: saPath("/tasks"),
      contactsUrl: saPath("/contacts"),
      calendarUrl: saPath("/calendar"),
      pipelineUrl: saPath("/pipeline"),
      conversationsUrl: saPath("/conversations"),
      todayLabel: "morning",
    });

    let sentCount = 0;
    for (const to of recipients) {
      try {
        await sendEmail({ to, subject, text, html, from: tenantFrom(sub) });
        sentCount += 1;
      } catch (err) {
        console.warn("[briefing] send failed", subAccountId, to, err);
      }
    }

    return {
      sent: sentCount > 0,
      reason: sentCount > 0 ? undefined : "all_sends_failed",
      recipientCount: sentCount,
    };
  } catch (err) {
    console.error("[briefing] sendDailyBriefingForSubAccount failed", subAccountId, err);
    return { sent: false, reason: "error" };
  }
}
