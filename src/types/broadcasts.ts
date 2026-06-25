import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Bulk email broadcasts.
 *
 * Schema:
 *   broadcasts/{broadcastId}                  — the broadcast doc
 *   broadcasts/{broadcastId}/sends/{contactId} — per-recipient row
 *
 * The broadcast doc tracks the audience as a whole (totals, status, who
 * triggered it). The per-recipient subcollection rows are the unit of work
 * fanned out via QStash — one row, one /step callback, one Resend API
 * call. Status transitions on the row drive the totals on the parent doc
 * via FieldValue.increment().
 *
 * Channel is email-only in v1. SMS broadcasts come in a follow-up that adds
 * compliance scaffolding (consent capture, A2P 10DLC throughput awareness).
 */

export type BroadcastChannel = "email";

export type BroadcastStatus =
  /** Audience computed, sends queued, QStash messages published. */
  | "queued"
  /** First send has fired; at least one row has flipped from queued. */
  | "sending"
  /** Every row has settled (sent / skipped / failed). */
  | "completed"
  /** Hard-failed during creation (e.g. QStash misconfigured). */
  | "failed";

/**
 * Audience filter applied at fan-out time. v1 supports three modes — full
 * sub-account contacts, a single tag, or a single pipeline stage. v2 will
 * stack filters and add saved Smart Lists.
 */
export type BroadcastAudienceFilter =
  | { kind: "all" }
  | { kind: "tag"; tag: string }
  | { kind: "pipeline_stage"; stage: string };

export interface BroadcastTotals {
  /** Total contacts the audience query returned (before opt-out / missing-email skip). */
  audienceSize: number;
  /** Recipients fanned out to QStash. */
  queued: number;
  /** Recipients confirmed delivered to Resend (their API accepted the send). */
  sent: number;
  /** Recipients dropped pre-send (opted out, no email address, etc.). */
  skipped: number;
  /** Recipients where the Resend API call returned an error. */
  failed: number;
}

export interface BroadcastDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  channel: BroadcastChannel;
  templateId: string;
  /** Snapshot of the template name at send time — survives template renames. */
  templateName: string;
  /** Snapshot of the resolved subject (after merge tags). Useful for the list view. */
  subjectPreview: string;
  audienceFilter: BroadcastAudienceFilter;
  status: BroadcastStatus;
  totals: BroadcastTotals;
  /** UID of the user who triggered the send. */
  createdByUid: string;
  /** Display name + email of the trigger user — survives user deletion. */
  createdBy: {
    displayName: string;
    email: string;
  };
  createdAt: Timestamp | FieldValue | null;
  startedAt: Timestamp | FieldValue | null;
  completedAt: Timestamp | FieldValue | null;
  /** Populated when status === "failed". */
  errorMessage: string | null;
}

/** Reasons the step executor skips a recipient WITHOUT calling Resend. */
export type BroadcastSkipReason =
  /** contact.emailOptedOut === true at send time. */
  | "opt_out"
  /** Contact has no email address (defensive — pre-filter usually catches this). */
  | "no_email"
  /** Send window outside the sub-account's configured hours (will defer + retry). */
  | "send_window_deferred"
  /** Contact was deleted between fan-out and send. */
  | "contact_missing";

export type BroadcastSendStatus =
  | "queued"
  | "sent"
  | "skipped"
  | "failed";

export interface BroadcastSendDoc {
  id: string; // === contactId
  broadcastId: string;
  agencyId: string;
  subAccountId: string;
  contactId: string;
  /** Snapshot of the contact's email at fan-out time — audit even if contact deleted. */
  toEmail: string;
  /** Snapshot of the contact's display name. */
  toName: string;
  status: BroadcastSendStatus;
  skippedReason: BroadcastSkipReason | null;
  /** Resend message id once the send succeeds. */
  resendMessageId: string | null;
  /** Resend API error message when status === "failed". */
  error: string | null;
  /** Number of step-executor attempts for this row (capped to prevent retry storms). */
  attempts: number;
  queuedAt: Timestamp | FieldValue | null;
  sentAt: Timestamp | FieldValue | null;
}
