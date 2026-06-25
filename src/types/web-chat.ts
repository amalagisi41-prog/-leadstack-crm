import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Web Chat session = a single browser-side chat thread, identified by a
 * UUID the widget generates and stores in localStorage. Persists across
 * page reloads (same visitor, same session) and across visits on the same
 * device until they clear storage.
 *
 * Sessions are anonymous on creation. When the bot extracts identity
 * fields via the [[capture …]] marker (see lib/comms/web-chat/capture.ts),
 * we lazily create or reconcile a Contact and store the link on
 * `contactId`. After that, the session is treated as identified — the
 * contact context block gets injected like the SMS thread does.
 *
 * Persistence path: `subAccounts/{subAccountId}/webChatSessions/{sessionId}`
 * Messages:        `subAccounts/{subAccountId}/webChatSessions/{sessionId}/messages/{messageId}`
 *
 * Rules: server-only writes (the public /api/web-chat/* routes use the
 * Admin SDK). Sub-account members can read for the future operator
 * console (Phase 2).
 */

export type WebChatSessionStatus = "active" | "closed" | "escalated";

export interface WebChatSession {
  id: string;
  agencyId: string;
  subAccountId: string;
  /** Null until the bot extracts identity via a [[capture …]] marker.
   *  Once set, the session is "identified" — the contact context block
   *  gets injected on every subsequent reply. */
  contactId: string | null;
  /** The host page URL when the session was created. Useful for the
   *  operator to know what page the visitor was on. */
  pageUrl: string | null;
  referrer: string | null;
  /** The Origin header value at session create time, lowercased.
   *  Used for debugging mismatches with the allowedDomains list. */
  origin: string | null;
  visitorIp: string | null;
  visitorUserAgent: string | null;
  status: WebChatSessionStatus;
  messageCount: number;
  tokensUsed: number;
  /** Snapshot of what the [[capture …]] marker extracted, even if the
   *  Contact-creation step later failed. Lets us re-attempt linking
   *  without re-asking the visitor. */
  capturedName: string | null;
  capturedEmail: string | null;
  capturedPhone: string | null;
  /** Stamped the first time the inline-form marker fires (or the visitor
   *  fills/skips the form). Used to suppress re-emission of the form
   *  even if the LLM ignores its "AT MOST ONCE" instruction, AND to
   *  signal "captured" status to the system prompt on later turns. */
  capturePromptShownAt: Timestamp | FieldValue | null;
  /** True when the visitor clicked Skip on the form. Bot is told not to
   *  ask again. */
  captureSkipped: boolean;
  /** Id of the Task auto-created when this session was captured. Null
   *  for anonymous sessions and pre-Phase-2B sessions. The console reads
   *  the linked Task to show pending-follow-up status. */
  pendingFollowUpTaskId: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  lastMessageAt: Timestamp | FieldValue | null;
}

export interface WebChatMessage {
  id: string;
  agencyId: string;
  subAccountId: string;
  sessionId: string;
  direction: "inbound" | "outbound";
  /** The text the visitor sees. For outbound messages this has the
   *  [[capture …]] marker stripped — the marker is only visible in
   *  server-side logs. */
  body: string;
  /** Tokens consumed to generate this message. Outbound only; null on
   *  inbound. */
  tokens: number | null;
  aiGenerated: boolean;
  createdAt: Timestamp | FieldValue | null;
}
