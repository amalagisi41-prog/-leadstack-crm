import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Workflow Builder — the general automation engine that replaces the legacy
 * single-recipe `automations` engine. A workflow is a TRIGGER + a graph of
 * NODES (linear with if/else branches). A RUN is one contact's enrollment
 * walking that graph; the QStash step worker advances it node by node.
 */

export type WorkflowStatus = "draft" | "active" | "paused";

export type WorkflowTriggerType =
  | "contact.created"
  | "contact.tag.added"
  | "form.submitted"
  | "pipeline.stage.changed"
  | "booking.created"
  | "quote.accepted"
  // Fired from the Vapi end-of-call handler (lib/comms/voice/end-of-call.ts)
  // for an INBOUND call to the Voice AI number that ended without a real
  // exchange (caller hung up before engaging, very short call, no-answer-
  // like ended reason). An inbound-initiated trigger — see
  // lib/workflows/guardrails.ts's quiet-hours exemption.
  | "contact.missed_call"
  // Fired from PATCH /api/deals/[id] when a Won deal's `completed` flag
  // flips false → true. Distinct from `pipeline.stage.changed` because a
  // deal can be marked completed without its stage changing on that write.
  | "deal.completed"
  // Time-based triggers — fired by a daily sweep (lib/workflows/time-triggers.ts)
  // rather than synchronously from a write path. "Today" and "this year" are
  // evaluated in the sub-account's sendWindow timezone.
  | "contact.birthday"
  | "contact.home_anniversary"
  | "contact.stale";

/* ------------------------------ Conditions ----------------------------- */

export type ConditionOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_set"
  | "not_set"
  | "has_tag"
  | "in_stage"
  | "source_is";

export interface Condition {
  /** Contact field path (e.g. "email", "company", "customFields.x"). */
  field: string;
  op: ConditionOp;
  value?: string;
}

/** v1: a single AND list. OR/nested groups are a v2 add. */
export interface ConditionGroup {
  all: Condition[];
}

/* -------------------------------- Trigger ------------------------------ */

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  filters: ConditionGroup;
  /** Restrict `form.submitted` to one form. Null/absent = any form. */
  formId?: string | null;
  /** Restrict `pipeline.stage.changed` to one target stage. */
  toStage?: string | null;
  /** `contact.stale` only: how many days of no outbound contact qualifies. */
  staleDays?: number | null;
}

/* --------------------------------- Nodes ------------------------------- */

export type WorkflowNodeType =
  | "send_email"
  | "send_sms"
  | "whatsapp_template"
  | "wait"
  | "if_else"
  | "goal"
  | "add_tag"
  | "remove_tag"
  | "move_stage"
  | "update_field"
  | "create_task"
  | "notify"
  | "webhook"
  // Delegates to the real Google Review Requests feature
  // (lib/reviews/request.ts::maybeSendReviewRequest) instead of sending a
  // canned message — reuses the sub-account's own configured review link,
  // channel, and cooldown so a Method Template can drive the send without
  // duplicating (or fighting) the dedicated feature's config/UI.
  | "google_review_request";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  /** Node-type-specific config (validated per type at execution). */
  config: Record<string, unknown>;
  /** Next node for a linear step. Null/absent ends the run. */
  next?: string | null;
  /** Branch targets for an `if_else` node. */
  branches?: { whenTrue: string | null; whenFalse: string | null };
}

export interface WorkflowDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string;
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  /** Entry node id. Null = empty workflow (won't enroll). */
  startNodeId: string | null;
  nodes: Record<string, WorkflowNode>;
  stats: { enrolled: number; completed: number };
  /**
   * Set only when this workflow was seeded from a Method Template
   * (`/templates`) — either automatically at provisioning time or manually
   * from the starter gallery. `templateVersion` mirrors the template's
   * `version` at seed time so a future migration pass can detect
   * workspaces still on an older shipped version. Null/undefined for
   * hand-built workflows.
   */
  templateKey?: string | null;
  templateVersion?: number | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/* --------------------------------- Runs -------------------------------- */

export type WorkflowRunStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "exited";

export interface WorkflowRunHistoryEntry {
  nodeId: string;
  type: WorkflowNodeType;
  at: Timestamp | FieldValue | null;
  /** "ok" | "skipped:<reason>" | "error:<msg>" | "branch:true|false". */
  result: string;
}

export interface WorkflowRunDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  workflowId: string;
  contactId: string;
  status: WorkflowRunStatus;
  currentNodeId: string | null;
  history: WorkflowRunHistoryEntry[];
  /** Trigger payload snapshot (e.g. { formId, dealId }). */
  context: Record<string, unknown>;
  qstashMessageId: string | null;
  enrolledAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/* ------------------------ Node config (typed views) -------------------- */

export interface SendEmailConfig {
  subject: string;
  body: string;
}
export interface SendSmsConfig {
  body: string;
}
export interface WhatsappTemplateConfig {
  /** Approved WhatsApp template doc id (subAccounts/{id}/whatsappTemplates). */
  templateId: string;
  /**
   * Operator-set values for the template's MANUAL variables, keyed by position
   * (string keys for JSON). May contain merge tags; resolved at run time.
   * `merge_tag` variables auto-resolve from the contact and aren't stored here.
   */
  manualValues?: Record<string, string>;
}
export interface WaitConfig {
  seconds: number;
}
export interface IfElseConfig {
  conditions: ConditionGroup;
}
export interface TagConfig {
  tag: string;
}
export interface MoveStageConfig {
  stage: string;
}
export interface UpdateFieldConfig {
  field: string;
  value: string;
}
export interface CreateTaskConfig {
  title: string;
  dueInDays?: number;
}
/** Who an Internal notification step emails. Legacy configs predate this
 *  field — the engine treats a missing value like "custom" (use `to`, else
 *  fall back to the agency owner) for backward compatibility. */
export type NotifyRecipient = "owner" | "account_contact" | "custom";

export interface NotifyConfig {
  /** Recipient mode. Optional so pre-existing stored configs still parse. */
  recipient?: NotifyRecipient;
  /** Literal email — only used when `recipient` is "custom" (or absent). */
  to: string;
  subject: string;
  body: string;
}
export interface WebhookConfig {
  url: string;
}
