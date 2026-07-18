import type { MethodTemplateDefinition } from "./types";

/**
 * new-lead (form/IDX/valuation) → AI response <60s → nurture sequence
 *
 * `contact.created` fires from every lead-capture surface — hosted forms,
 * IDX inquiries, home-valuation requests, manual add, CSV import, the
 * public API — so this one trigger covers "new lead, however they arrived"
 * rather than duplicating a near-identical template per source. The engine
 * enrolls + runs the first node within seconds of the write, satisfying the
 * "<60s" response-time spec without any special-casing here.
 *
 * The immediate SMS is the lead reaching out first, so it's exempt from
 * quiet hours; the nurture step 2 days later is outbound-initiated and is
 * always gated by the sub-account's configured send window.
 */
export const newLeadInstantResponse: MethodTemplateDefinition = {
  key: "new-lead-instant-response",
  version: 1,
  displayName: "New Lead → Instant Response",
  description:
    "Any new lead — a form, an IDX inquiry, a home valuation request — gets an instant text and email, then a check-in two days later if they've gone quiet.",
  seed: () => ({
    trigger: { type: "contact.created", filters: { all: [] } },
    nodes: {
      n1: {
        id: "n1",
        type: "send_sms",
        config: {
          body: "Hi {{contact.firstName}}, thanks for reaching out — got your message and I'll have some options ready for you shortly. Anything specific you're looking for?",
        },
        next: "n2",
      },
      n2: {
        id: "n2",
        type: "send_email",
        config: {
          subject: "Thanks for reaching out",
          body: "Hi {{contact.firstName}},\n\nThanks for getting in touch! I'll follow up shortly with next steps. In the meantime, feel free to reply here or grab a time on my calendar: {{bookingLink}}\n\n{{unsubscribeLink}}",
        },
        next: "n3",
      },
      n3: {
        id: "n3",
        type: "wait",
        config: { seconds: 2 * 86_400 },
        next: "n4",
      },
      n4: {
        id: "n4",
        type: "send_sms",
        config: {
          body: "Hi {{contact.firstName}}, just checking in — still exploring your options, or is there anything I can help clarify?",
        },
        next: "n5",
      },
      n5: {
        id: "n5",
        type: "create_task",
        config: {
          title: "Follow up with {{contact.name}} — new lead",
          dueInDays: 1,
        },
        next: null,
      },
    },
    startNodeId: "n1",
  }),
};
