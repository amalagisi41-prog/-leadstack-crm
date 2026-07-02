import type { PipelineStageOverride } from "@/types/deals";
import type { WorkflowNode, WorkflowTrigger } from "@/types/workflows";

/**
 * Role-based starter snapshots.
 *
 * A snapshot pre-configures a new sub-account for a specific real-estate role
 * so the operator can drop in a CSV of contacts and start working leads
 * immediately: a tailored pipeline, ready email/SMS templates, an AI persona,
 * and draft workflows wired to the right triggers.
 *
 * Three roles: solo_agent, team_builder, broker_office. Applied by
 * lib/snapshots/apply.ts (auto on sub-account creation + the manual
 * apply-snapshot route). Workflows ship as DRAFT — the operator reviews and
 * flips them to Active once their sender (Twilio/Resend) is configured.
 *
 * MERGE TAGS: templates + workflow send/notify nodes may only use the tags
 * the resolver supports — {{contact.firstName/lastName/name/email/phone}},
 * {{owner.firstName/email}}, {{workspace.name}}, {{bookingLink}},
 * {{unsubscribeLink}}. Anything else resolves to empty.
 */

export type SnapshotId = "solo_agent" | "team_builder" | "broker_office";

export interface SnapshotTemplate {
  key: string;
  type: "email" | "sms";
  name: string;
  subject: string | null;
  body: string;
}

export interface SnapshotWorkflow {
  key: string;
  name: string;
  trigger: WorkflowTrigger;
  startNodeId: string;
  nodes: Record<string, WorkflowNode>;
}

export interface SnapshotDef {
  id: SnapshotId;
  name: string;
  description: string;
  pipelineStages: PipelineStageOverride[];
  persona: string;
  templates: SnapshotTemplate[];
  workflows: SnapshotWorkflow[];
}

// ─── Shared template bodies (resolver-safe merge tags) ───────────────────────

const SPEED_SMS: SnapshotTemplate = {
  key: "speed_sms",
  type: "sms",
  name: "Speed-to-Lead: Instant SMS",
  subject: null,
  body: "Hi {{contact.firstName}}, this is {{owner.firstName}} from {{workspace.name}}. I just got your inquiry and I'm giving you a call now. If I miss you, reply here with a good time. Reply STOP to opt out.",
};

const SPEED_EMAIL: SnapshotTemplate = {
  key: "speed_email",
  type: "email",
  name: "Speed-to-Lead: Instant Email",
  subject: "{{contact.firstName}}, I got your inquiry — let's connect",
  body: `Hi {{contact.firstName}},

Thanks for reaching out to {{workspace.name}}! I'd love to help with your real estate goals.

I'll call you shortly. Prefer to pick a time yourself? Grab a slot here: {{bookingLink}}

{{owner.firstName}}
{{workspace.name}}

---
{{unsubscribeLink}}`,
};

const FOLLOWUP_EMAIL: SnapshotTemplate = {
  key: "followup_email",
  type: "email",
  name: "Follow-Up: Day 3",
  subject: "Still thinking about your move?",
  body: `Hi {{contact.firstName}},

Just following up from my earlier note. Whether you're weeks out or just exploring, I'm happy to put together a no-pressure market snapshot for you.

Reply here or book a quick call: {{bookingLink}}

{{owner.firstName}}
{{workspace.name}}

---
{{unsubscribeLink}}`,
};

// ─── Workflow node helpers ───────────────────────────────────────────────────

function sms(id: string, body: string, next: string | null): WorkflowNode {
  return { id, type: "send_sms", config: { body }, next };
}
function email(id: string, subject: string, body: string, next: string | null): WorkflowNode {
  return { id, type: "send_email", config: { subject, body }, next };
}
function notify(id: string, subject: string, body: string, next: string | null): WorkflowNode {
  return { id, type: "notify", config: { recipient: "owner", to: "", subject, body }, next };
}
function task(id: string, title: string, dueInDays: number, next: string | null): WorkflowNode {
  return { id, type: "create_task", config: { title, dueInDays }, next };
}
function addTag(id: string, tag: string, next: string | null): WorkflowNode {
  return { id, type: "add_tag", config: { tag }, next };
}
function wait(id: string, days: number, next: string | null): WorkflowNode {
  return { id, type: "wait", config: { seconds: days * 86400 }, next };
}

const UNSUB = "\n\n{{unsubscribeLink}}";

// ─── Snapshot definitions ────────────────────────────────────────────────────

export const SNAPSHOTS: Record<SnapshotId, SnapshotDef> = {
  solo_agent: {
    id: "solo_agent",
    name: "The Solo Agent",
    description:
      "For an individual agent. A simple deal pipeline plus a Speed-to-Lead workflow that texts, emails, and reminds you to call every new lead.",
    pipelineStages: [
      { id: "new", label: "New Lead", order: 0 },
      { id: "contacted", label: "Contacted", order: 1 },
      { id: "qualified", label: "Showing Scheduled", order: 2 },
      { id: "proposal", label: "Offer Made", order: 3 },
      { id: "won", label: "Closed", order: 4 },
      { id: "lost", label: "Lost", order: 5 },
    ],
    persona:
      "You are a helpful real estate assistant for a solo agent. Greet inbound leads warmly, find out if they're buying or selling and their timeline and target area, then offer to connect them with the agent for a quick call. Keep replies short and never invent listings, prices, or market data.",
    templates: [SPEED_SMS, SPEED_EMAIL, FOLLOWUP_EMAIL],
    workflows: [
      {
        key: "speed_to_lead",
        name: "Speed-to-Lead",
        trigger: { type: "form.submitted", filters: { all: [] } },
        startNodeId: "n1",
        nodes: {
          n1: sms("n1", SPEED_SMS.body, "n2"),
          n2: email("n2", SPEED_EMAIL.subject!, SPEED_EMAIL.body, "n3"),
          n3: task("n3", "Call {{contact.firstName}} — new lead", 0, "n4"),
          n4: notify("n4", "New lead", "{{contact.name}} ({{contact.email}} · {{contact.phone}}) just came in.", null),
        },
      },
    ],
  },

  team_builder: {
    id: "team_builder",
    name: "The Team Builder",
    description:
      "For a growing team. Adds lead routing + a nurture sequence — new leads are tagged, the team is notified, and a drip keeps warm leads engaged.",
    pipelineStages: [
      { id: "new", label: "New Lead", order: 0 },
      { id: "contacted", label: "Assigned", order: 1 },
      { id: "qualified", label: "Nurturing", order: 2 },
      { id: "proposal", label: "Appointment Set", order: 3 },
      { id: "won", label: "Closed", order: 4 },
      { id: "lost", label: "Lost", order: 5 },
    ],
    persona:
      "You are the front-desk assistant for a real estate team. Qualify inbound leads (buying/selling, timeline, area, budget), capture their details, and let them know a team member will follow up shortly. Keep replies short and never invent listings or prices.",
    templates: [SPEED_SMS, SPEED_EMAIL, FOLLOWUP_EMAIL],
    workflows: [
      {
        key: "lead_routing",
        name: "New Lead Routing",
        trigger: { type: "contact.created", filters: { all: [] } },
        startNodeId: "n1",
        nodes: {
          n1: addTag("n1", "new-lead", "n2"),
          n2: notify("n2", "New lead to assign", "{{contact.name}} ({{contact.email}} · {{contact.phone}}) needs an agent.", "n3"),
          n3: task("n3", "Assign {{contact.firstName}} to an agent", 0, null),
        },
      },
      {
        key: "nurture",
        name: "Lead Nurture (7-day)",
        trigger: { type: "contact.tag.added", filters: { all: [{ field: "tags", op: "has_tag", value: "nurture" }] } },
        startNodeId: "n1",
        nodes: {
          n1: email("n1", "Great to connect, {{contact.firstName}}", "Hi {{contact.firstName}},\n\nJust checking in from {{workspace.name}} — when you're ready to talk options, I'm here. Book a time any time: {{bookingLink}}" + UNSUB, "n2"),
          n2: wait("n2", 3, "n3"),
          n3: email("n3", "A quick market note", "Hi {{contact.firstName}},\n\nThe market's moving — happy to send a tailored snapshot for your area. Just reply or grab a slot: {{bookingLink}}" + UNSUB, null),
        },
      },
    ],
  },

  broker_office: {
    id: "broker_office",
    name: "Broker Office",
    description:
      "For a brokerage overseeing multiple agents. Adds lead distribution + a listing-progress touch, with a pipeline tuned for broker oversight.",
    pipelineStages: [
      { id: "new", label: "New Lead", order: 0 },
      { id: "contacted", label: "Agent Assigned", order: 1 },
      { id: "qualified", label: "Qualified", order: 2 },
      { id: "proposal", label: "Under Contract", order: 3 },
      { id: "won", label: "Closed", order: 4 },
      { id: "lost", label: "Lost", order: 5 },
    ],
    persona:
      "You are the receptionist for a real estate brokerage. Greet inbound leads, capture buying/selling intent, timeline, area, and contact details, and let them know the right agent will reach out. Keep replies short and never invent listings, prices, or commitments.",
    templates: [SPEED_SMS, SPEED_EMAIL, FOLLOWUP_EMAIL],
    workflows: [
      {
        key: "lead_distribution",
        name: "Lead Distribution",
        trigger: { type: "contact.created", filters: { all: [] } },
        startNodeId: "n1",
        nodes: {
          n1: addTag("n1", "unassigned", "n2"),
          n2: notify("n2", "New brokerage lead", "{{contact.name}} ({{contact.email}} · {{contact.phone}}) came in — assign to an agent.", "n3"),
          n3: task("n3", "Distribute {{contact.firstName}} to an agent", 0, null),
        },
      },
      {
        key: "under_contract",
        name: "Under-Contract Check-in",
        trigger: { type: "pipeline.stage.changed", filters: { all: [] }, toStage: "proposal" },
        startNodeId: "n1",
        nodes: {
          n1: email("n1", "You're under contract — here's what's next", "Hi {{contact.firstName}},\n\nCongratulations on going under contract with {{workspace.name}}! Your agent will walk you through inspection, appraisal, and closing. Questions any time — just reply." + UNSUB, "n2"),
          n2: task("n2", "Kick off closing checklist for {{contact.firstName}}", 1, null),
        },
      },
    ],
  },
};

export const SNAPSHOT_LIST: SnapshotDef[] = Object.values(SNAPSHOTS);
