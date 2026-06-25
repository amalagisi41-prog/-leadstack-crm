import type { Timestamp, FieldValue } from "firebase/firestore";
import type { BroadcastAudienceFilter } from "./broadcasts";

/**
 * Bulk outbound AI voice campaigns (Phase 2 of outbound calling).
 *
 * Schema:
 *   voiceCampaigns/{campaignId}                       — the campaign doc
 *   voiceCampaigns/{campaignId}/recipients/{contactId} — per-recipient row
 *
 * Mirrors the bulk-email broadcasts model: the parent tracks the audience
 * as a whole (totals, status, who triggered it + the consent ack); the
 * per-recipient subcollection rows are the unit of work fanned out via
 * QStash. Each row → one /campaign/step callback → the outbound compliance
 * gate → one Vapi call (or a skip / a window deferral). Row transitions
 * drive the parent totals via FieldValue.increment().
 *
 * Reuses BroadcastAudienceFilter (all / tag / pipeline_stage) so the
 * audience picker is identical to bulk email.
 */

export type VoiceCampaignStatus =
  /** Audience computed, recipients queued, QStash messages published. */
  | "queued"
  /** First call has fired; at least one row has left "queued". */
  | "calling"
  /** Every row has settled (called / skipped / failed). */
  | "completed"
  /** Operator hit the stop button — no further calls are placed. */
  | "cancelled"
  /** Hard-failed during creation (e.g. QStash misconfigured). */
  | "failed";

export interface VoiceCampaignTotals {
  /** Contacts the audience query returned (before pre-flight skip). */
  audienceSize: number;
  /** Recipients still waiting to be dialled (or being deferred). */
  queued: number;
  /** Recipients a call was successfully placed for. */
  called: number;
  /** Recipients dropped by the compliance gate (opt-out, caps, window
   *  never reached, etc.) — no call placed. */
  skipped: number;
  /** Recipients where placing the call errored at the Vapi layer. */
  failed: number;
  /** Of the called recipients, how many the AI flagged as interested
   *  (drives the hot-lead Task + the headline metric). */
  interested: number;
}

/** Per-contact result once a campaign call completes (set by the
 *  end-of-call handler). Distinct from the recipient `status` (which
 *  tracks queue progress) — this is the conversation outcome. */
export type VoiceCampaignOutcome =
  | "interested"
  | "not_interested"
  | "callback"
  | "no_answer"
  | "voicemail"
  | "completed"
  | "failed";

/** Suppression settings the operator chose at launch — stored on the
 *  campaign for the audit trail. */
export interface VoiceCampaignSuppression {
  /** Skip contacts called by any campaign in the last N days (null = off). */
  recentDays: number | null;
  /** Skip contacts who were recipients of this earlier campaign (null = off). */
  excludeCampaignId: string | null;
  /** Skip contacts carrying this tag (null = off). */
  excludeTag: string | null;
}

export interface VoiceCampaignDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  /** Auto-issued audit code, e.g. "VC-2026-0001" (per sub-account). */
  code: string;
  /** Optional operator-given label, e.g. "30-Day Challenge — free trials". */
  name: string;
  /** Suppression settings used at launch (audit). */
  suppression: VoiceCampaignSuppression;
  audienceFilter: BroadcastAudienceFilter;
  /** Snapshot of the outbound opener used for this campaign. */
  openerPreview: string;
  status: VoiceCampaignStatus;
  totals: VoiceCampaignTotals;
  /** Operator confirmed (for the whole batch) that these contacts
   *  consented to be called. Passed to the per-call compliance gate. */
  consentAck: boolean;
  createdByUid: string;
  createdBy: { displayName: string; email: string };
  createdAt: Timestamp | FieldValue | null;
  startedAt: Timestamp | FieldValue | null;
  completedAt: Timestamp | FieldValue | null;
  errorMessage: string | null;
}

/**
 * Why a recipient was skipped without a call being placed. Mirrors the
 * outbound compliance gate's `code`s plus pre-flight + housekeeping
 * reasons. `window_unreached` means the row was deferred to the contact's
 * calling window too many times (defensive — practically never hit).
 */
export type VoiceCampaignSkipReason =
  | "opted_out"
  | "no_phone"
  | "country_blocked"
  | "daily_cap"
  | "number_frequency"
  | "scrub_blocked"
  | "window_unreached"
  | "contact_missing"
  /** Operator stopped the campaign before this contact was dialled. */
  | "cancelled"
  /** Suppressed at fan-out: called too recently by another campaign. */
  | "recently_called"
  /** Suppressed at fan-out: carries the operator's excluded tag. */
  | "suppressed_tag"
  /** Suppressed at fan-out: was a recipient of an excluded prior campaign. */
  | "prior_campaign";

export type VoiceCampaignRecipientStatus =
  | "queued"
  | "called"
  | "skipped"
  | "failed";

export interface VoiceCampaignRecipientDoc {
  id: string; // === contactId
  campaignId: string;
  agencyId: string;
  subAccountId: string;
  contactId: string;
  /** Snapshot of the contact's phone + name at fan-out time. */
  toPhone: string;
  toName: string;
  status: VoiceCampaignRecipientStatus;
  skippedReason: VoiceCampaignSkipReason | null;
  /** Vapi call id once a call is placed. */
  callId: string | null;
  /** Vapi per-call control URL (from monitor.controlUrl) — lets the
   *  "stop all" kill switch end this call if it's still live. */
  callControlUrl: string | null;
  /** Conversation outcome once the call completes (set by the end-of-call
   *  handler). Null until then. */
  outcome: VoiceCampaignOutcome | null;
  /** Call length in seconds (set at end-of-call). */
  callDurationSec: number | null;
  /** Vapi's end-state for the call, e.g. "customer-did-not-answer",
   *  "assistant-ended-call" (set at end-of-call). */
  endedReason: string | null;
  /** Vapi's plain-text call summary (set at end-of-call). */
  callSummary: string | null;
  /** Follow-up Task id created when the lead was flagged interested. */
  taskId: string | null;
  /** Error string when status === "failed". */
  error: string | null;
  /** Step-callback attempts (includes window/rate deferrals) — capped to
   *  prevent infinite reschedule loops. */
  attempts: number;
  queuedAt: Timestamp | FieldValue | null;
  settledAt: Timestamp | FieldValue | null;
}
