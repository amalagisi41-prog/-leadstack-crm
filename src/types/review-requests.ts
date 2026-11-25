import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * The post-closing review-request automation's mode, on
 * `GoogleReviewConfig.automationMode`. Undefined reads as "log_only" — the
 * shipped default: every step is created, delayed and logged, nothing sends.
 */
export type ReviewAutomationMode = "off" | "log_only" | "live";

export const DEFAULT_REVIEW_AUTOMATION_MODE: ReviewAutomationMode = "log_only";
/** Days after a deal reaches Closed (won) before the request goes out. */
export const DEFAULT_REVIEW_DELAY_DAYS = 3;
export const MAX_REVIEW_DELAY_DAYS = 30;

export type ReviewRequestStatus =
  /** Waiting for its delayed send time. */
  | "queued"
  /** Log-only: every check passed; a live run would have sent. */
  | "would_send"
  | "sent"
  | "failed"
  /** Not sent for a contact-level reason (opted out, asked recently, no phone). */
  | "skipped"
  /** The automation was turned off before the send time. */
  | "cancelled";

export type ReviewRequestTrigger =
  | "deal_won"
  | "manual"
  | "quote_paid"
  | "deal_completed"
  | "workflow";

export interface ReviewRequestEvent {
  at: Date | Timestamp;
  type: "created" | "queued" | "would_send" | "sent" | "failed" | "skipped" | "cancelled";
  message: string;
}

/** `reviewRequests/{id}` — one row on the Review Requests page. */
export interface ReviewRequestDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  contactId: string;
  contactName: string;
  dealId: string | null;
  dealTitle: string | null;
  trigger: ReviewRequestTrigger;
  /** Mode in force when the request was created ("manual" for the button). */
  mode: ReviewAutomationMode | "manual";
  channel: string | null;
  status: ReviewRequestStatus;
  /** When the delayed send is / was due. Null for immediate sends. */
  scheduledFor: Timestamp | Date | null;
  sentAt: Timestamp | Date | null;
  /** Machine reason of the last outcome (see lib/reviews/reasons.ts). */
  reason: string | null;
  /** Whether a review link was set up at the last attempt. */
  reviewLinkSet: boolean;
  events: ReviewRequestEvent[];
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}
