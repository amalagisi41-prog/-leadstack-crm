import type { MethodTemplateDefinition } from "./types";

/**
 * cold-lead 90-day revival
 *
 * `contact.stale` is the existing time-based trigger (daily sweep, see
 * src/lib/workflows/time-triggers.ts) evaluated against `lastContactedAt` /
 * `lastOutboundCallAt` in the sub-account's timezone. This is an outbound-
 * initiated re-engagement, not a reply to anything the lead just did, so it
 * is always subject to quiet hours (no inbound-triggered exemption) —
 * enforced by the shared guardrail layer regardless of trigger type.
 *
 * Distinct from the shorter, general-purpose "Stale Lead Revive" starter
 * (14-day default, still available standalone) — this is the canonical
 * 90-day cadence from the Method Template spec.
 */
export const coldLead90DayRevival: MethodTemplateDefinition = {
  key: "cold-lead-90-day-revival",
  version: 1,
  displayName: "Cold Lead 90-Day Revival",
  description:
    "No contact in 90 days → a low-pressure check-in text, then a task to personally follow up if they don't reply.",
  seed: () => ({
    trigger: {
      type: "contact.stale",
      filters: { all: [] },
      staleDays: 90,
    },
    nodes: {
      n1: {
        id: "n1",
        type: "send_sms",
        config: {
          body: "Hi {{contact.firstName}}, it's been a little while — just checking in to see if your plans have changed or if you're still looking. Happy to help whenever the timing's right.",
        },
        next: "n2",
      },
      n2: {
        id: "n2",
        type: "create_task",
        config: {
          title: "Follow up with {{contact.name}} — 90-day revival",
          dueInDays: 2,
        },
        next: null,
      },
    },
    startNodeId: "n1",
  }),
};
