/**
 * The AI Morning Brief — pure recommendation-engine layer. Portable by
 * design: no Firestore, no Next.js, no Admin SDK — just plain data in,
 * plain data out. The daily-briefing orchestrator (src/lib/briefing/send.ts)
 * fetches the raw signals and calls compileMorningBrief(); the app's
 * existing email adapter (lib/comms/resend.ts) does the actual send.
 */

export interface QuietLead {
  contactId: string;
  name: string;
  /** Days since the last outbound touch (call, SMS, email) — the biggest
   *  number is the coldest lead. */
  daysSinceContact: number;
}

export interface NewLead {
  contactId: string;
  name: string;
}

export interface EscalatedChat {
  sessionId: string;
  contactId: string | null;
  /** Best available identity — captured name, else email/phone, else "a visitor". */
  identity: string;
}

export interface OverdueTask {
  taskId: string;
  title: string;
  daysOverdue: number;
}

export interface AppointmentToday {
  eventId: string;
  title: string;
  /** Pre-formatted local time label, e.g. "2:30pm" — formatting happens at
   *  the call site (has timezone context), not in this pure module. Display
   *  only — NOT sortable (12-hour "4:00pm" vs "9:00am" compares wrong as a
   *  plain string). */
  timeLabel: string;
  /** Minutes since local midnight — the actual sort key. */
  minutesFromMidnight: number;
}

export interface WonDeal {
  dealId: string;
  title: string;
  value: number;
}

export interface MorningBriefInputs {
  quietLeads: QuietLead[];
  newLeadsToday: NewLead[];
  escalatedChats: EscalatedChat[];
  overdueTasks: OverdueTask[];
  appointmentsToday: AppointmentToday[];
  wonDealsRecently: WonDeal[];
}

export type RecommendedActionKind =
  | "escalated_chat"
  | "overdue_task"
  | "quiet_lead"
  | "new_lead"
  | "appointment";

export interface RecommendedAction {
  kind: RecommendedActionKind;
  label: string;
  /** Relative path under the sub-account (e.g. "/contacts/abc123"). The
   *  orchestrator prefixes this with the sub-account's base URL. */
  path: string;
}

export interface MorningBrief {
  quietLeadsCount: number;
  hotActivityCount: number;
  topActions: RecommendedAction[];
  /** SMS-ready summary, kept under 320 chars — no markdown, no emoji, per
   *  the codebase's SMS safety-rail convention (see prompt.ts). */
  smsText: string;
  /** True when there's genuinely nothing to report — the orchestrator
   *  skips sending on this rather than mailing an empty brief. */
  isEmpty: boolean;
}
