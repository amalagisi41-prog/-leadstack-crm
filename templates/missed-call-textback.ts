import type { MethodTemplateDefinition } from "./types";

/**
 * missed-call → AI textback → qualify → book
 *
 * Fires the instant the Voice AI channel detects an inbound call that ended
 * without a real exchange (hang-up, voicemail, very short connect) — see
 * `contact.missed_call` in src/lib/comms/voice/end-of-call.ts. This is the
 * lead reaching out first, so the immediate SMS is exempt from quiet hours
 * (src/lib/workflows/guardrails.ts's inbound-triggered exemption); the
 * follow-up task is not a contact-facing send and is unaffected by quiet
 * hours either way.
 */
export const missedCallTextback: MethodTemplateDefinition = {
  key: "missed-call-textback",
  version: 1,
  displayName: "Missed Call → Textback",
  description:
    "A call comes in and goes unanswered → an instant apology text with a booking link, then a task so you can personally follow up and qualify the lead.",
  seed: () => ({
    trigger: { type: "contact.missed_call", filters: { all: [] } },
    nodes: {
      n1: {
        id: "n1",
        type: "send_sms",
        config: {
          body: "Hi {{contact.firstName}}, sorry we missed your call! Happy to help — what can I do for you? You can also grab a time that works here: {{bookingLink}}",
        },
        next: "n2",
      },
      n2: {
        id: "n2",
        type: "create_task",
        config: {
          title: "Call back {{contact.name}} — missed call",
          dueInDays: 1,
        },
        next: null,
      },
    },
    startNodeId: "n1",
  }),
};
