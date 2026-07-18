import type {
  MorningBrief,
  MorningBriefInputs,
  RecommendedAction,
} from "./types";

/**
 * Pure recommendation engine for the AI Morning Brief. No I/O — takes
 * already-fetched signals and produces a ranked "top 3" plus an SMS-ready
 * summary. Unit/snapshot-tested directly; the orchestrator
 * (src/lib/briefing/send.ts) owns fetching data and sending.
 *
 * Priority order (most urgent first): a human is explicitly needed
 * (escalated chat) > a promise already broken (overdue task) > a lead
 * going cold, coldest first (quiet lead) > a lead who just showed up
 * (new lead — lower urgency since the instant-response Method Template
 * already replied) > a scheduled appointment (informational, earliest
 * first). The full candidate pool is built in that order and the first
 * three become `topActions` — this reads as "most urgent first," not a
 * round-robin across categories.
 */
export function compileMorningBrief(
  inputs: MorningBriefInputs,
): MorningBrief {
  const candidates: RecommendedAction[] = [];

  for (const chat of inputs.escalatedChats) {
    candidates.push({
      kind: "escalated_chat",
      label: `${chat.identity} needs a human reply`,
      path: chat.contactId
        ? `/contacts/${chat.contactId}`
        : `/ai-agents/web-chat/sessions/${chat.sessionId}`,
    });
  }

  const overdueSorted = [...inputs.overdueTasks].sort(
    (a, b) => b.daysOverdue - a.daysOverdue,
  );
  for (const task of overdueSorted) {
    candidates.push({
      kind: "overdue_task",
      label: `Overdue: ${task.title}`,
      path: `/tasks`,
    });
  }

  const quietSorted = [...inputs.quietLeads].sort(
    (a, b) => b.daysSinceContact - a.daysSinceContact,
  );
  for (const lead of quietSorted) {
    candidates.push({
      kind: "quiet_lead",
      label: `${lead.name} has gone quiet (${lead.daysSinceContact}d)`,
      path: `/contacts/${lead.contactId}`,
    });
  }

  for (const lead of inputs.newLeadsToday) {
    candidates.push({
      kind: "new_lead",
      label: `New lead: ${lead.name}`,
      path: `/contacts/${lead.contactId}`,
    });
  }

  const appointmentsSorted = [...inputs.appointmentsToday].sort(
    (a, b) => a.minutesFromMidnight - b.minutesFromMidnight,
  );
  for (const appt of appointmentsSorted) {
    candidates.push({
      kind: "appointment",
      label: `${appt.timeLabel} — ${appt.title}`,
      path: `/calendar`,
    });
  }

  const topActions = candidates.slice(0, 3);

  const hotActivityCount =
    inputs.newLeadsToday.length +
    inputs.escalatedChats.length +
    inputs.appointmentsToday.length +
    inputs.wonDealsRecently.length;
  const quietLeadsCount = inputs.quietLeads.length;

  const isEmpty =
    hotActivityCount === 0 &&
    quietLeadsCount === 0 &&
    inputs.overdueTasks.length === 0;

  const smsText = buildSmsText({
    quietLeadsCount,
    hotActivityCount,
    topActions,
  });

  return { quietLeadsCount, hotActivityCount, topActions, smsText, isEmpty };
}

function buildSmsText(brief: {
  quietLeadsCount: number;
  hotActivityCount: number;
  topActions: RecommendedAction[];
}): string {
  if (brief.topActions.length === 0) {
    return "Your morning brief: nothing urgent today. Inbox is clear.";
  }
  const headline = `${brief.hotActivityCount} hot, ${brief.quietLeadsCount} going quiet.`;
  const actions = brief.topActions.map((a) => a.label).join(" · ");
  const text = `Morning brief: ${headline} Top: ${actions}`;
  return text.length > 320 ? `${text.slice(0, 317)}...` : text;
}
