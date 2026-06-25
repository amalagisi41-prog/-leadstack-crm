import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Per-contact SMS messages — the chat thread lives at:
 *   contacts/{contactId}/messages/{messageId}
 *
 * Only populated when the parent sub-account has `twilioConfig.enabled === true`.
 * In shared-sender mode (env-var Twilio) we don't write here; the existing
 * activity timeline still records `sms_sent` rows so nothing regresses.
 *
 * Doc IDs: prefer Twilio's MessageSid so retries from Twilio dedupe naturally
 * (the inbound webhook can use `set(..., { merge: true })` and shrug off
 * duplicates). For outbound rows where we don't have the SID until the API
 * returns, use a Firestore auto-id and stamp twilioMessageSid afterward.
 */

export type MessageDirection = "inbound" | "outbound";

export type MessageStatus =
  /** Created locally, awaiting Twilio API response. */
  | "queued"
  /** Twilio accepted the outbound send. Most outbound messages settle here. */
  | "sent"
  /** Twilio reported a delivery failure; `error` is populated. */
  | "failed"
  /** Inbound message — set on every inbound row. */
  | "received";

export interface MessageDoc {
  id: string;
  /** Tenancy keys mirrored from the parent contact for rule + query convenience. */
  agencyId: string;
  subAccountId: string;
  contactId: string;
  direction: MessageDirection;
  status: MessageStatus;
  /** Plain-text body. Twilio caps SMS at 1600 chars; we don't pad. */
  body: string;
  /** E.164. For outbound: sub-account's fromNumber. For inbound: contact's phone. */
  from: string;
  /** E.164. For outbound: contact's phone. For inbound: sub-account's fromNumber. */
  to: string;
  /** Twilio MessageSid — populated once the API call returns / on inbound. */
  twilioMessageSid: string | null;
  /** Outbound only: which user clicked Send. Null for automation-generated sends. */
  sentByUid: string | null;
  /** Populated when status === "failed". */
  error: string | null;
  createdAt: Timestamp | FieldValue | null;
  /**
   * Set when a sub-account user opens the contact's Messages tab. Used to
   * compute unread-count badges. Null until first read.
   */
  readAt: Timestamp | FieldValue | null;
}
