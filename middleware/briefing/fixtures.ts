import type { MorningBriefInputs } from "./types";

/** Seeded fixture: a realistic, busy morning — one of every signal type. */
export const BUSY_MORNING_FIXTURE: MorningBriefInputs = {
  quietLeads: [
    { contactId: "c_cold_1", name: "Priya Shah", daysSinceContact: 12 },
    { contactId: "c_cold_2", name: "Marcus Webb", daysSinceContact: 5 },
  ],
  newLeadsToday: [{ contactId: "c_new_1", name: "Jordan Lee" }],
  escalatedChats: [
    {
      sessionId: "s_1",
      contactId: "c_esc_1",
      identity: "Sam Rivera",
    },
  ],
  overdueTasks: [
    { taskId: "t_1", title: "Send comps to the Whitfields", daysOverdue: 3 },
    { taskId: "t_2", title: "Call back about the inspection", daysOverdue: 1 },
  ],
  appointmentsToday: [
    {
      eventId: "e_1",
      title: "Showing — 42 Elm St",
      timeLabel: "2:30pm",
      minutesFromMidnight: 14 * 60 + 30,
    },
    {
      eventId: "e_2",
      title: "Listing consult — Nguyen",
      timeLabel: "10:00am",
      minutesFromMidnight: 10 * 60,
    },
  ],
  wonDealsRecently: [
    { dealId: "d_1", title: "112 Oak Ave", value: 480_000 },
  ],
};

/** Seeded fixture: a genuinely quiet day — nothing to report. */
export const QUIET_DAY_FIXTURE: MorningBriefInputs = {
  quietLeads: [],
  newLeadsToday: [],
  escalatedChats: [],
  overdueTasks: [],
  appointmentsToday: [],
  wonDealsRecently: [],
};

/** Seeded fixture: many candidates in every category, to exercise the
 *  top-3 truncation and the SMS-length cap. */
export const OVERLOADED_FIXTURE: MorningBriefInputs = {
  quietLeads: Array.from({ length: 8 }, (_, i) => ({
    contactId: `c_cold_${i}`,
    name: `Cold Lead ${i}`,
    daysSinceContact: 20 - i,
  })),
  newLeadsToday: Array.from({ length: 5 }, (_, i) => ({
    contactId: `c_new_${i}`,
    name: `New Lead ${i}`,
  })),
  escalatedChats: Array.from({ length: 4 }, (_, i) => ({
    sessionId: `s_${i}`,
    contactId: `c_esc_${i}`,
    identity: `Escalated Visitor ${i}`,
  })),
  overdueTasks: Array.from({ length: 6 }, (_, i) => ({
    taskId: `t_${i}`,
    title: `Overdue task number ${i} with a fairly long descriptive title`,
    daysOverdue: 10 - i,
  })),
  appointmentsToday: Array.from({ length: 3 }, (_, i) => ({
    eventId: `e_${i}`,
    title: `Appointment ${i}`,
    timeLabel: `${9 + i}:00am`,
    minutesFromMidnight: (9 + i) * 60,
  })),
  wonDealsRecently: [],
};
