/**
 * Pure aggregation for the Daily Briefing email. No I/O — takes already
 * -fetched raw doc arrays and a `now` instant, returns plain counts. Kept
 * separate from `send.ts` (the server-only Admin SDK orchestrator) so this
 * math can be unit-tested directly, mirroring `time-trigger-dates.ts`'s
 * split.
 */

export interface BriefingTimestampLike {
  toMillis?: () => number;
  seconds?: number;
}

function toMillis(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const t = v as BriefingTimestampLike;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return null;
}

export interface BriefingContactLike {
  createdAt: unknown;
}

export interface BriefingTaskLike {
  completed: boolean;
  dueAt: unknown;
}

export interface BriefingDealLike {
  stageId: string;
  value: number;
  stageChangedAt: unknown;
}

export interface BriefingEventLike {
  startAt: unknown;
}

export interface BriefingSessionLike {
  status: string;
}

export interface BriefingStats {
  newLeads: number;
  tasksDueToday: number;
  tasksOverdue: number;
  appointmentsToday: number;
  dealsWon: number;
  dealsWonValue: number;
  escalatedChats: number;
}

export interface ComputeBriefingStatsInput {
  contacts: BriefingContactLike[];
  tasks: BriefingTaskLike[];
  deals: BriefingDealLike[];
  events: BriefingEventLike[];
  sessions: BriefingSessionLike[];
  /** Start-of-local-day boundary for "today" (ms since epoch), in the
   *  sub-account's timezone. */
  todayStartMs: number;
  todayEndMs: number;
  now: Date;
}

/** True when the digest has nothing worth emailing — every count is zero. */
export function briefingIsEmpty(stats: BriefingStats): boolean {
  return (
    stats.newLeads === 0 &&
    stats.tasksDueToday === 0 &&
    stats.tasksOverdue === 0 &&
    stats.appointmentsToday === 0 &&
    stats.dealsWon === 0 &&
    stats.escalatedChats === 0
  );
}

export function computeBriefingStats(
  input: ComputeBriefingStatsInput,
): BriefingStats {
  const { todayStartMs, todayEndMs, now } = input;
  const nowMs = now.getTime();
  const dayAgoMs = nowMs - 24 * 60 * 60 * 1000;

  let newLeads = 0;
  for (const c of input.contacts) {
    const ms = toMillis(c.createdAt);
    if (ms !== null && ms >= dayAgoMs) newLeads += 1;
  }

  let tasksDueToday = 0;
  let tasksOverdue = 0;
  for (const t of input.tasks) {
    if (t.completed) continue;
    const ms = toMillis(t.dueAt);
    if (ms === null) continue;
    if (ms < todayStartMs) tasksOverdue += 1;
    else if (ms >= todayStartMs && ms < todayEndMs) tasksDueToday += 1;
  }

  let appointmentsToday = 0;
  for (const e of input.events) {
    const ms = toMillis(e.startAt);
    if (ms !== null && ms >= todayStartMs && ms < todayEndMs) {
      appointmentsToday += 1;
    }
  }

  let dealsWon = 0;
  let dealsWonValue = 0;
  for (const d of input.deals) {
    if (d.stageId !== "won") continue;
    const ms = toMillis(d.stageChangedAt);
    if (ms !== null && ms >= dayAgoMs) {
      dealsWon += 1;
      dealsWonValue += d.value || 0;
    }
  }

  const escalatedChats = input.sessions.filter(
    (s) => s.status === "escalated",
  ).length;

  return {
    newLeads,
    tasksDueToday,
    tasksOverdue,
    appointmentsToday,
    dealsWon,
    dealsWonValue,
    escalatedChats,
  };
}
