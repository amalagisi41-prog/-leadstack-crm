import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Unified inbox index — one doc per contact at `conversations/{contactId}`.
 *
 * This is a thin INDEX, not a message store. The actual messages stay in their
 * existing per-contact subcollections (`contacts/{id}/messages` for SMS,
 * `contacts/{id}/whatsappMessages` for WhatsApp); the inbox detail view merges
 * those at read time. This doc only holds the denormalized state the inbox LIST
 * needs (last-message preview, unread count, status) plus the per-conversation
 * AI controls reserved for a later phase (`botMode`, `botPausedUntil`).
 *
 * Written server-side by `lib/server/conversations-service.ts` on every inbound
 * + outbound message. Doc id == contactId (1:1), so upserts need no lookup and
 * the detail page can read the contact's message subcollections directly.
 *
 * Only created when a real message row is written — i.e. dedicated-Twilio SMS,
 * a configured WhatsApp sender, or (beta) a connected Meta inbox. Shared-sender
 * SMS (no message rows) produces no conversation, consistent with the
 * per-contact threads. Message subcollections by channel:
 *   sms → contacts/{id}/messages, whatsapp → contacts/{id}/whatsappMessages,
 *   messenger + instagram → contacts/{id}/metaMessages (channel-discriminated).
 */

/**
 * `messenger` + `instagram` are the BETA Meta channels — gated by the agency
 * `metaInboxEnabledByAgency` flag, so they only ever appear once that's on.
 */
export type ConversationChannel = "sms" | "whatsapp" | "messenger" | "instagram";

export type ConversationStatus = "open" | "closed" | "snoozed";

/**
 * Per-conversation AI mode:
 *  - "auto"    — bot replies automatically (default).
 *  - "suggest" — bot drafts a reply into `pendingDraft`; a human approves/edits.
 *  - "off"     — bot stays silent on this conversation.
 */
export type ConversationBotMode = "off" | "suggest" | "auto";

/**
 * A bot-generated reply awaiting human approval (suggest mode). Cleared when
 * approved (a human send clears it server-side) or discarded.
 */
export interface ConversationDraft {
  body: string;
  channel: ConversationChannel;
  model: string;
  tokens: number;
  createdAt: Timestamp | FieldValue | null;
}

export interface ConversationDoc {
  id: string;
  /** == doc id. */
  contactId: string;
  /** Tenancy keys (every list query filters on subAccountId). */
  subAccountId: string;
  agencyId: string;
  /** Denormalized so the list renders without N contact reads. */
  contactName: string;
  contactPhone: string | null;
  /** Channels this thread has carried, e.g. ["sms","whatsapp"]. */
  channelsSeen: ConversationChannel[];
  /** Channel of the most recent message — the composer's default. */
  lastChannel: ConversationChannel;
  lastDirection: "inbound" | "outbound";
  /** First ~120 chars of the most recent message body. */
  lastMessagePreview: string;
  /** Sort key for the inbox list (newest first). */
  lastMessageAt: Timestamp | FieldValue | null;
  /** Incremented server-side on inbound; reset to 0 client-side on open. */
  unreadCount: number;
  status: ConversationStatus;
  assigneeUid: string | null;
  /** AI mode for this conversation. Default "auto". */
  botMode: ConversationBotMode;
  /** When set + in the future, the bot stays quiet (human took over). */
  botPausedUntil: Timestamp | FieldValue | null;
  /** Suggest-mode draft awaiting human approval; null when none. */
  pendingDraft: ConversationDraft | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
