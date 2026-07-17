import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { computeBriefingStats, briefingIsEmpty } from "./compute";

const NOW = new Date("2026-07-14T15:00:00Z");
const DAY_START = new Date("2026-07-14T00:00:00Z").getTime();
const DAY_END = DAY_START + 24 * 60 * 60 * 1000;

function ts(iso: string) {
  return Timestamp.fromDate(new Date(iso));
}

const baseInput = {
  contacts: [],
  tasks: [],
  deals: [],
  events: [],
  sessions: [],
  todayStartMs: DAY_START,
  todayEndMs: DAY_END,
  now: NOW,
};

describe("computeBriefingStats", () => {
  it("counts contacts created in the last 24h as new leads", () => {
    const stats = computeBriefingStats({
      ...baseInput,
      contacts: [
        { createdAt: ts("2026-07-14T10:00:00Z") }, // within 24h
        { createdAt: ts("2026-07-13T10:00:00Z") }, // exactly 29h ago, excluded
        { createdAt: ts("2026-07-11T00:00:00Z") }, // stale, excluded
      ],
    });
    expect(stats.newLeads).toBe(1);
  });

  it("splits incomplete tasks into due-today vs overdue by the local day window", () => {
    const stats = computeBriefingStats({
      ...baseInput,
      tasks: [
        { completed: false, dueAt: ts("2026-07-14T18:00:00Z") }, // today
        { completed: false, dueAt: ts("2026-07-12T09:00:00Z") }, // overdue
        { completed: false, dueAt: ts("2026-07-16T09:00:00Z") }, // future, ignored
        { completed: true, dueAt: ts("2026-07-12T09:00:00Z") }, // done, ignored
        { completed: false, dueAt: null }, // no due date, ignored
      ],
    });
    expect(stats.tasksDueToday).toBe(1);
    expect(stats.tasksOverdue).toBe(1);
  });

  it("counts events starting inside today's window", () => {
    const stats = computeBriefingStats({
      ...baseInput,
      events: [
        { startAt: ts("2026-07-14T20:00:00Z") }, // today
        { startAt: ts("2026-07-15T01:00:00Z") }, // tomorrow, excluded
      ],
    });
    expect(stats.appointmentsToday).toBe(1);
  });

  it("sums won-deal value only for deals that moved to won in the last 24h", () => {
    const stats = computeBriefingStats({
      ...baseInput,
      deals: [
        { stageId: "won", value: 5000, stageChangedAt: ts("2026-07-14T09:00:00Z") },
        { stageId: "won", value: 1200, stageChangedAt: ts("2026-07-10T09:00:00Z") }, // stale won
        { stageId: "proposal", value: 900, stageChangedAt: ts("2026-07-14T09:00:00Z") }, // not won
      ],
    });
    expect(stats.dealsWon).toBe(1);
    expect(stats.dealsWonValue).toBe(5000);
  });

  it("counts escalated web-chat sessions regardless of when they happened", () => {
    const stats = computeBriefingStats({
      ...baseInput,
      sessions: [{ status: "escalated" }, { status: "active" }, { status: "escalated" }],
    });
    expect(stats.escalatedChats).toBe(2);
  });
});

describe("briefingIsEmpty", () => {
  it("is true when every count is zero", () => {
    const stats = computeBriefingStats(baseInput);
    expect(briefingIsEmpty(stats)).toBe(true);
  });

  it("is false when any single count is nonzero", () => {
    const stats = computeBriefingStats({
      ...baseInput,
      sessions: [{ status: "escalated" }],
    });
    expect(briefingIsEmpty(stats)).toBe(false);
  });
});
