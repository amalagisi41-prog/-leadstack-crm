import { describe, it, expect } from "vitest";
import { compileMorningBrief } from "./compile";
import {
  BUSY_MORNING_FIXTURE,
  QUIET_DAY_FIXTURE,
  OVERLOADED_FIXTURE,
} from "./fixtures";

describe("compileMorningBrief — snapshot fixtures", () => {
  it("a busy morning with one of every signal", () => {
    expect(compileMorningBrief(BUSY_MORNING_FIXTURE)).toMatchSnapshot();
  });

  it("a genuinely quiet day — isEmpty and no actions", () => {
    const brief = compileMorningBrief(QUIET_DAY_FIXTURE);
    expect(brief).toMatchSnapshot();
    expect(brief.isEmpty).toBe(true);
    expect(brief.topActions).toHaveLength(0);
  });

  it("an overloaded day truncates to the top 3 highest-priority actions", () => {
    const brief = compileMorningBrief(OVERLOADED_FIXTURE);
    expect(brief).toMatchSnapshot();
    expect(brief.topActions).toHaveLength(3);
  });
});

describe("compileMorningBrief — priority ordering", () => {
  it("escalated chats always outrank overdue tasks", () => {
    const brief = compileMorningBrief({
      quietLeads: [],
      newLeadsToday: [],
      escalatedChats: [
        { sessionId: "s1", contactId: "c1", identity: "Alex" },
      ],
      overdueTasks: [
        { taskId: "t1", title: "Very overdue", daysOverdue: 30 },
      ],
      appointmentsToday: [],
      wonDealsRecently: [],
    });
    expect(brief.topActions[0].kind).toBe("escalated_chat");
    expect(brief.topActions[1].kind).toBe("overdue_task");
  });

  it("overdue tasks outrank quiet leads, which outrank new leads and appointments", () => {
    const brief = compileMorningBrief({
      quietLeads: [{ contactId: "c1", name: "Cold One", daysSinceContact: 40 }],
      newLeadsToday: [{ contactId: "c2", name: "Fresh One" }],
      escalatedChats: [],
      overdueTasks: [{ taskId: "t1", title: "Overdue", daysOverdue: 1 }],
      appointmentsToday: [
        {
          eventId: "e1",
          title: "Showing",
          timeLabel: "9:00am",
          minutesFromMidnight: 9 * 60,
        },
      ],
      wonDealsRecently: [],
    });
    expect(brief.topActions.map((a) => a.kind)).toEqual([
      "overdue_task",
      "quiet_lead",
      "new_lead",
    ]);
  });

  it("within quiet leads, the coldest (most days since contact) comes first", () => {
    const brief = compileMorningBrief({
      quietLeads: [
        { contactId: "c1", name: "Warmer", daysSinceContact: 4 },
        { contactId: "c2", name: "Colder", daysSinceContact: 15 },
      ],
      newLeadsToday: [],
      escalatedChats: [],
      overdueTasks: [],
      appointmentsToday: [],
      wonDealsRecently: [],
    });
    expect(brief.topActions[0].label).toContain("Colder");
  });

  it("within appointments, earliest time comes first", () => {
    const brief = compileMorningBrief({
      quietLeads: [],
      newLeadsToday: [],
      escalatedChats: [],
      overdueTasks: [],
      appointmentsToday: [
        {
          eventId: "e1",
          title: "Later",
          timeLabel: "4:00pm",
          minutesFromMidnight: 16 * 60,
        },
        {
          eventId: "e2",
          title: "Earlier",
          timeLabel: "9:00am",
          minutesFromMidnight: 9 * 60,
        },
      ],
      wonDealsRecently: [],
    });
    expect(brief.topActions[0].label).toContain("Earlier");
  });
});

describe("compileMorningBrief — SMS text", () => {
  it("never exceeds 320 characters even with many candidates", () => {
    const brief = compileMorningBrief(OVERLOADED_FIXTURE);
    expect(brief.smsText.length).toBeLessThanOrEqual(320);
  });

  it("reads as a clean all-clear when there's nothing to report", () => {
    const brief = compileMorningBrief(QUIET_DAY_FIXTURE);
    expect(brief.smsText).toBe(
      "Your morning brief: nothing urgent today. Inbox is clear.",
    );
  });
});
