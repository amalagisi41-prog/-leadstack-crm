import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendEmail, emailIsConfigured, tenantFrom } from "@/lib/comms/resend";
import { CUSTOM_BRAND } from "@/config/landing";
import { localTimeInfo } from "./local-time";
import { computeBriefingStats, briefingIsEmpty, toMillis } from "./compute";
import { renderDailyBriefingEmail } from "./email";
import { compileMorningBrief } from "@middleware/briefing/compile";
import type { MorningBriefInputs } from "@middleware/briefing/types";
import type { SubAccountDoc } from "@/types";

/** Contacts with no outbound touch in this many days show up as a "quiet
 *  lead" in the morning brief's top actions — a shorter, day-to-day
 *  awareness threshold than the 90-day cold-lead-revival Method Template's
 *  re-engagement automation. */
const QUIET_LEAD_DAYS = 3;
/** Cap on how many quiet-lead candidates we build before handing them to
 *  the compiler (which itself only surfaces the top 3 overall) — avoids
 *  needlessly stringifying every stale contact in a large book of business. */
const MAX_QUIET_LEAD_CANDIDATES = 10;

/**
 * Daily Briefing orchestrator. Fanned out hourly by
 * /api/cron/daily-briefing (itself scheduled by the
 * "agentstack-daily-briefing" QStash cron) — one call per opted-in
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

    const now = new Date();
    const nowMs = now.getTime();

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
      now,
    });

    const briefInputs = buildMorningBriefInputs({
      contactsSnap,
      tasksSnap,
      dealsSnap,
      eventsSnap,
      sessionsSnap,
      timezone: sub.timezone,
      dayStartMs: info.dayStartMs,
      dayEndMs: info.dayEndMs,
      nowMs,
    });
    const brief = compileMorningBrief(briefInputs);

    // A briefing with nothing to report still stamps the dedup marker (so
    // it doesn't re-evaluate all day) but skips the send — an empty inbox
    // doesn't need an email to prove it.
    const shouldSend = !briefingIsEmpty(stats) || !brief.isEmpty;

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
      topActions: brief.topActions.map((a) => ({ ...a, href: saPath(a.path) })),
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

/** Formats an hour/minute pair as a 12-hour clock label, e.g. "2:30pm". */
function formatTimeLabel(hour24: number, minute: number): string {
  const period = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minuteStr = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  return `${hour12}${minuteStr}${period}`;
}

/** Local hour/minute of a millisecond timestamp, in the given timezone. */
function localHourMinute(ms: number, timezone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { hour: get("hour") % 24, minute: get("minute") };
}

/** Maps the raw Firestore snapshots already fetched for computeBriefingStats
 *  into the pure MorningBriefInputs shape the @middleware/briefing compiler
 *  consumes. Kept in the server-only orchestrator (not the pure module)
 *  since it reads Firestore doc data directly. */
function buildMorningBriefInputs(input: {
  contactsSnap: FirebaseFirestore.QuerySnapshot;
  tasksSnap: FirebaseFirestore.QuerySnapshot;
  dealsSnap: FirebaseFirestore.QuerySnapshot;
  eventsSnap: FirebaseFirestore.QuerySnapshot;
  sessionsSnap: FirebaseFirestore.QuerySnapshot;
  timezone: string;
  dayStartMs: number;
  dayEndMs: number;
  nowMs: number;
}): MorningBriefInputs {
  const { dayStartMs, dayEndMs, nowMs, timezone } = input;
  const dayAgoMs = nowMs - 24 * 60 * 60 * 1000;

  const quietLeads: MorningBriefInputs["quietLeads"] = [];
  const newLeadsToday: MorningBriefInputs["newLeadsToday"] = [];
  for (const doc of input.contactsSnap.docs) {
    const data = doc.data();
    const createdMs = toMillis(data.createdAt);
    if (createdMs !== null && createdMs >= dayStartMs && createdMs < dayEndMs) {
      newLeadsToday.push({ contactId: doc.id, name: (data.name as string) || "Unnamed lead" });
      continue;
    }
    const lastTouchMs = Math.max(
      toMillis(data.lastContactedAt) ?? 0,
      toMillis(data.lastOutboundCallAt) ?? 0,
    );
    if (lastTouchMs <= 0) continue;
    const daysSinceContact = Math.floor((nowMs - lastTouchMs) / 86_400_000);
    if (daysSinceContact >= QUIET_LEAD_DAYS) {
      quietLeads.push({
        contactId: doc.id,
        name: (data.name as string) || "Unnamed lead",
        daysSinceContact,
      });
    }
  }
  quietLeads.sort((a, b) => b.daysSinceContact - a.daysSinceContact);

  const escalatedChats: MorningBriefInputs["escalatedChats"] = input.sessionsSnap.docs
    .filter((d) => d.data().status === "escalated")
    .map((d) => {
      const data = d.data();
      const identity =
        (data.capturedName as string) ||
        (data.capturedEmail as string) ||
        (data.capturedPhone as string) ||
        "A visitor";
      return {
        sessionId: d.id,
        contactId: (data.contactId as string) || null,
        identity,
      };
    });

  const overdueTasks: MorningBriefInputs["overdueTasks"] = [];
  for (const doc of input.tasksSnap.docs) {
    const data = doc.data();
    if (data.completed) continue;
    const dueMs = toMillis(data.dueAt);
    if (dueMs === null || dueMs >= dayStartMs) continue;
    overdueTasks.push({
      taskId: doc.id,
      title: (data.title as string) || "Untitled task",
      daysOverdue: Math.max(1, Math.floor((dayStartMs - dueMs) / 86_400_000)),
    });
  }

  const appointmentsToday: MorningBriefInputs["appointmentsToday"] = [];
  for (const doc of input.eventsSnap.docs) {
    const data = doc.data();
    const startMs = toMillis(data.startAt);
    if (startMs === null || startMs < dayStartMs || startMs >= dayEndMs) continue;
    const { hour, minute } = localHourMinute(startMs, timezone);
    appointmentsToday.push({
      eventId: doc.id,
      title: (data.title as string) || "Untitled event",
      timeLabel: formatTimeLabel(hour, minute),
      minutesFromMidnight: hour * 60 + minute,
    });
  }

  const wonDealsRecently: MorningBriefInputs["wonDealsRecently"] = [];
  for (const doc of input.dealsSnap.docs) {
    const data = doc.data();
    if (data.stageId !== "won") continue;
    const changedMs = toMillis(data.stageChangedAt);
    if (changedMs === null || changedMs < dayAgoMs) continue;
    wonDealsRecently.push({
      dealId: doc.id,
      title: (data.title as string) || "Untitled deal",
      value: (data.value as number) ?? 0,
    });
  }

  return {
    quietLeads: quietLeads.slice(0, MAX_QUIET_LEAD_CANDIDATES),
    newLeadsToday,
    escalatedChats,
    overdueTasks,
    appointmentsToday,
    wonDealsRecently,
  };
}
