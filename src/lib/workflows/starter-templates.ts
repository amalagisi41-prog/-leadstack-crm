import type { WorkflowDoc, WorkflowNode, WorkflowTrigger } from "@/types/workflows";

/**
 * Curated starter gallery for the Workflow Builder. Selecting one seeds a new
 * draft workflow (trigger + nodes) the operator can edit before enabling —
 * "every workflow should be editable but already built" per the product
 * vision. Mirrors `lib/comms/whatsapp/starter-templates.ts`'s shape: pure
 * data (no `server-only`) so both the picker UI and the server-side create
 * route can import it directly.
 */

export interface WorkflowStarterTemplate {
  /** Stable key — also the `template` value POSTed to the create route. */
  key: string;
  displayName: string;
  /** One-line description shown in the gallery card. */
  description: string;
  seed: () => Pick<WorkflowDoc, "trigger" | "nodes" | "startNodeId">;
}

function blankSeed(
  trigger: WorkflowTrigger,
  nodes: Record<string, WorkflowNode>,
  startNodeId: string | null,
): Pick<WorkflowDoc, "trigger" | "nodes" | "startNodeId"> {
  return { trigger, nodes, startNodeId };
}

export const WORKFLOW_STARTER_TEMPLATES: WorkflowStarterTemplate[] = [
  {
    key: "speed-to-lead",
    displayName: "Speed-to-Lead",
    description:
      "Form submit → instant SMS + email to the lead → notify the team.",
    seed: () =>
      blankSeed(
        { type: "form.submitted", filters: { all: [] } },
        {
          n1: {
            id: "n1",
            type: "send_sms",
            config: {
              body: "Hi {{contact.firstName}}, thanks for reaching out — we got your message and will be in touch shortly.",
            },
            next: "n2",
          },
          n2: {
            id: "n2",
            type: "send_email",
            config: {
              subject: "Thanks for reaching out",
              body: "Hi {{contact.firstName}},\n\nThanks for getting in touch. A member of our team will follow up shortly.\n\n{{unsubscribeLink}}",
            },
            next: "n3",
          },
          n3: {
            id: "n3",
            type: "notify",
            config: {
              to: "",
              subject: "New lead from your form",
              body: "{{contact.name}} ({{contact.email}} · {{contact.phone}}) just submitted a form.",
            },
            next: null,
          },
        },
        "n1",
      ),
  },
  {
    key: "stale-lead-revive",
    displayName: "Stale Lead Revive",
    description:
      "No contact in 14 days → a check-in text, then flag it for you if they don't reply.",
    seed: () =>
      blankSeed(
        {
          type: "contact.stale",
          filters: { all: [] },
          staleDays: 14,
        },
        {
          n1: {
            id: "n1",
            type: "send_sms",
            config: {
              body: "Hi {{contact.firstName}}, just checking in — still looking, or has your situation changed? Happy to help whenever you're ready.",
            },
            next: "n2",
          },
          n2: {
            id: "n2",
            type: "create_task",
            config: {
              title: "Follow up with {{contact.name}} — went quiet",
              dueInDays: 2,
            },
            next: null,
          },
        },
        "n1",
      ),
  },
  {
    key: "birthday-greeting",
    displayName: "Birthday Greeting",
    description:
      "Sends a warm birthday text automatically, once a year, to any contact with a birthday on file.",
    seed: () =>
      blankSeed(
        { type: "contact.birthday", filters: { all: [] } },
        {
          n1: {
            id: "n1",
            type: "send_sms",
            config: {
              body: "Happy birthday, {{contact.firstName}}! Hope you have a great one. 🎉",
            },
            next: null,
          },
        },
        "n1",
      ),
  },
  {
    key: "home-anniversary-greeting",
    displayName: "Home Anniversary Greeting",
    description:
      "Congratulates a contact each year on the anniversary of their home purchase — a natural, low-pressure reason to stay top-of-mind.",
    seed: () =>
      blankSeed(
        { type: "contact.home_anniversary", filters: { all: [] } },
        {
          n1: {
            id: "n1",
            type: "send_email",
            config: {
              subject: "Happy home anniversary!",
              body: "Hi {{contact.firstName}},\n\nJust a note to say happy home anniversary! Hope the place is treating you well — let me know if you ever want a no-pressure read on what it's worth today.\n\n{{unsubscribeLink}}",
            },
            next: null,
          },
        },
        "n1",
      ),
  },
  {
    key: "review-request-on-won",
    displayName: "Review Request on Won",
    description:
      "A deal moves to Won → a few days later, send a personal note. Skip this if Settings → Google Review Requests is already on — that one fires separately on deal completion and sends the real review link, so running both asks twice.",
    seed: () =>
      blankSeed(
        {
          type: "pipeline.stage.changed",
          filters: { all: [] },
          toStage: "won",
        },
        {
          n1: {
            id: "n1",
            type: "wait",
            config: { seconds: 3 * 86_400 },
            next: "n2",
          },
          n2: {
            id: "n2",
            type: "send_email",
            config: {
              subject: "Congrats again!",
              body: "Hi {{contact.firstName}},\n\nCongrats again on closing! It was a pleasure working with you, and I'm just a call or text away if anything comes up.\n\n{{unsubscribeLink}}",
            },
            next: null,
          },
        },
        "n1",
      ),
  },
];

export function getWorkflowStarterTemplate(
  key: string,
): WorkflowStarterTemplate | undefined {
  return WORKFLOW_STARTER_TEMPLATES.find((t) => t.key === key);
}
