import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Voice call = a single inbound phone call answered by the AI voice
 * agent. One doc per call, written by the
 * `/api/webhooks/vapi/end-of-call/[subAccountId]` handler after Vapi
 * runs its post-call analysis pass.
 *
 * Persistence path: `subAccounts/{subAccountId}/voiceCalls/{callId}`
 *
 * Doc id = Vapi's `call.id` so retried webhook deliveries are naturally
 * idempotent. No subcollection — the transcript is small (capped voice
 * call, plain text) and lives inline on this doc.
 *
 * Rules: server-only writes (the public /api/webhooks/vapi/* routes
 * use the Admin SDK). Sub-account members can read for the operator
 * console.
 */

/** Single turn in the call's transcript. Vapi sends these with each
 *  call's analysis payload. `secondsFromStart` lets the UI render a
 *  readable timeline without storing absolute timestamps that would
 *  drift if the operator's clock is in a different zone. */
export interface VoiceTranscriptTurn {
  role: "assistant" | "user" | "system";
  content: string;
  /** Seconds from call start when this turn occurred. */
  secondsFromStart: number | null;
}

export interface VoiceCall {
  id: string;
  agencyId: string;
  subAccountId: string;
  /** Vapi's call id — same as `id`, kept duplicated for symmetry with
   *  other LeadStack doc types that carry their natural key as a field. */
  callId: string;
  /** Caller's phone in E.164 from caller ID. Null for web-call tests
   *  invoked from Vapi's Talk widget. */
  callerPhone: string | null;
  /** Number the caller dialled (our Twilio / Vapi number). */
  toPhone: string | null;
  /** Call direction. "inbound" = caller dialled us (the original voice
   *  agent). "outbound" = operator-initiated click-to-call via the
   *  /api/comms/voice/call route. Defaults to "inbound" for legacy docs
   *  written before outbound shipped. */
  direction: "inbound" | "outbound";
  durationSec: number;
  /** Vapi's plain-text post-call summary (1-3 sentences). */
  summary: string | null;
  /** Reason Vapi gave for the call ending — "customer-ended-call",
   *  "assistant-ended-call", "silence-timeout", "exceeded-max-duration",
   *  "provider-error-...". Free-form; whatever Vapi sent. */
  endedReason: string | null;
  /** Linked Contact (created or reconciled by the EOC handler). Null
   *  when the call didn't yield any phone/email for reconciliation. */
  contactId: string | null;
  /** True when the EOC handler created a brand-new Contact for this
   *  call (vs reconciling to one that already existed). */
  contactCreated: boolean;
  /** Vapi's structured-data extraction said the caller asked for a
   *  callback. Drives whether a follow-up Task is created. */
  callbackRequested: boolean;
  capturedName: string | null;
  capturedEmail: string | null;
  capturedPhone: string | null;
  /** Id of the follow-up Task auto-created when the call resulted in
   *  a callback request. Null for info-only calls. The operator
   *  console reads this via subscribeToTask() to render an
   *  Open/Closed badge that updates live as the task is marked done. */
  taskId: string | null;
  /** True when the escalation email was successfully sent to the
   *  agent's notify address. Failures land in `errors[]`. */
  escalationEmailSent: boolean;
  /** Full turn-by-turn transcript. Capped at a sensible length by
   *  Vapi's maxDurationSeconds × turns-per-second math, fits inline. */
  transcript: VoiceTranscriptTurn[];
  /** Live status set by status-update webhooks during the call.
   *  Foundation for a future "live call" indicator. Cleared after
   *  EOC. Free-form: "queued", "in-progress", "ended", "failed". */
  liveStatus: string | null;
  liveStatusAt: Timestamp | FieldValue | null;
  /** Any non-fatal errors the EOC handler hit (task create failed,
   *  email send failed, etc.). Operators can see what went wrong
   *  without the call itself failing. */
  errors: string[];
  createdAt: Timestamp | FieldValue | null;
}
