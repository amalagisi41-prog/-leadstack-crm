/**
 * Outbound webhooks — server-to-server event delivery for the public API.
 *
 * Subscribers register a URL + an event-type allowlist. Whenever a write
 * inside the sub-account emits a matching event, every subscription gets
 * its own delivery attempt, signed Stripe-style with `LeadStack-Signature`.
 *
 * Three Firestore collections:
 *   - `subAccounts/{id}/webhookSubscriptions/{subId}`
 *     One per subscriber URL. Carries the signing secret + circuit-breaker
 *     counters. Server-only writes via Admin SDK.
 *   - `subAccounts/{id}/webhookEvents/{eventId}`
 *     Append-only. One row per event emitted. Powers the "manual replay"
 *     UI in slice 8 by holding the payload long enough to re-fire.
 *   - `subAccounts/{id}/webhookEvents/{eventId}/deliveries/{deliveryId}`
 *     One row per attempt against one subscription. `attempt`, `status`,
 *     `httpStatus`, `responseBody` excerpt, `nextRetryAt`.
 *
 * `mode` mirrors API keys: a `test` subscription only fires for events
 * emitted by `test` mode API calls; `live` subscriptions never see test
 * traffic. Lets agencies preview integrations safely.
 */

export type WebhookSubscriptionStatus = "active" | "paused";

/**
 * The full event registry. Adding a new event type:
 *   1. Append the constant here.
 *   2. Wire `void emitEvent(...)` into the corresponding write path
 *      (slices 4-6 do this for contacts / deals / tasks / etc).
 *   3. Document the payload shape in /docs/api (slice 8).
 *
 * Naming follows Stripe convention: `<resource>.<verb>`. `.updated` fires
 * on every PATCH; resource-specific verbs (e.g. `deal.stage.changed`)
 * fire when the change is meaningful enough that subscribers usually want
 * a finer trigger than ".updated".
 */
export const WEBHOOK_EVENT_TYPES = [
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "deal.created",
  "deal.updated",
  "deal.deleted",
  "deal.stage.changed",
  "deal.won",
  "deal.lost",
  "task.created",
  "task.completed",
  "event.created",
  "form.submitted",
  "quote.sent",
  "quote.viewed",
  "quote.accepted",
  "quote.declined",
  "quote.paid",
  "booking.created",
  "booking.cancelled",
  // AI + member lifecycle events. Wired from existing dashboard write
  // paths (not the public API routes), so subscribers receive them
  // regardless of whether the source action was API-driven or operator-
  // driven from the dashboard. Skipped for test-mode subscriptions —
  // these are inherently live events.
  "voice.call.completed",
  "voice.call.captured",
  "webchat.lead.captured",
  "member.invited",
  "automation.completed",
  // Community + Courses (Skool-style) lifecycle. Emitted from the community
  // service write paths so automations can react to joins, purchases, and
  // course progress (e.g. "course.completed → tag + create task").
  "community.member.joined",
  "community.member.approved",
  "community.purchase.paid",
  "community.lesson.completed",
  "community.course.completed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookSubscriptionDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  mode: "live" | "test";
  /** Destination URL the dispatcher POSTs to. Must be https:// in production. */
  url: string;
  /** Operator label, e.g. "Slack alerts", "Zapier sync". */
  description: string | null;
  /** Event-type allowlist. Empty array means "every event" — discouraged but legal. */
  events: WebhookEventType[];
  /**
   * Raw signing secret used in `LeadStack-Signature` HMAC computation.
   * Returned to the subscriber ONCE at creation; stored raw here so the
   * dispatcher can sign. Server-only collection — Firestore rules deny
   * client access entirely.
   */
  signingSecret: string;
  status: WebhookSubscriptionStatus;
  /**
   * Consecutive failures since the last success. The dispatcher resets to
   * 0 on any successful delivery; the circuit breaker auto-pauses the
   * subscription when this hits 10.
   */
  consecutiveFailures: number;
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: number | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  pausedAt: Date | null;
  pausedReason: "circuit_breaker" | "manual" | null;
  createdByUid: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Wire shape for management API. Strips `signingSecret` after creation. */
export interface WebhookSubscriptionResponse {
  id: string;
  mode: "live" | "test";
  url: string;
  description: string | null;
  events: WebhookEventType[];
  status: WebhookSubscriptionStatus;
  consecutiveFailures: number;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: number | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  pausedAt: string | null;
  pausedReason: WebhookSubscriptionDoc["pausedReason"];
  createdAt: string;
  /** Only set in the create response — the operator copies this once. */
  signingSecret?: string;
}

export type WebhookDeliveryStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "exhausted";

export interface WebhookEventDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  mode: "live" | "test";
  type: WebhookEventType;
  /**
   * The serialized payload sent to subscribers (already passed through
   * the resource serializer). Stored as-is so manual replay reuses the
   * exact wire shape.
   */
  payload: unknown;
  /** Subscriptions that matched this event when it was emitted. */
  subscriptionIds: string[];
  createdAt: Date;
  /** TTL for background reaping. Events expire after 90 days. */
  expiresAt: Date;
}

export interface WebhookDeliveryDoc {
  id: string;
  eventId: string;
  subscriptionId: string;
  subAccountId: string;
  agencyId: string;
  /** 1-indexed: 1 on first try, 2 on first retry, etc. */
  attempt: number;
  /** URL snapshot at delivery time — survives if subscription URL is later edited. */
  url: string;
  status: WebhookDeliveryStatus;
  httpStatus: number | null;
  /** First 2KB of subscriber's response. Useful for debugging. */
  responseBody: string | null;
  responseHeaders: string | null;
  /** Short reason on failure (network error, non-2xx, timeout). */
  errorMessage: string | null;
  scheduledAt: Date;
  attemptedAt: Date | null;
  nextRetryAt: Date | null;
}

/**
 * Wire shape for one delivery attempt in the Logs → Webhooks viewer.
 * Serialized from a `deliveries/{deliveryId}` doc; timestamps are ISO
 * strings. `signingSecret` never appears here — deliveries don't carry it.
 */
export interface WebhookDeliveryLogResponse {
  id: string;
  subscriptionId: string;
  url: string;
  attempt: number;
  status: WebhookDeliveryStatus;
  httpStatus: number | null;
  errorMessage: string | null;
  responseBody: string | null;
  scheduledAt: string;
  attemptedAt: string | null;
  nextRetryAt: string | null;
}

/**
 * Wire shape for one emitted event in the Logs → Webhooks viewer, with its
 * delivery attempts nested. Serialized from `webhookEvents/{eventId}` + its
 * `deliveries` subcollection by `listRecentEventsWithDeliveries()`.
 */
export interface WebhookEventLogResponse {
  id: string;
  type: WebhookEventType;
  mode: "live" | "test";
  createdAt: string;
  /** How many subscriptions matched when the event was emitted. */
  subscriptionCount: number;
  deliveries: WebhookDeliveryLogResponse[];
}
