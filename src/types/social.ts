import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Social Planner v1 — schedule + auto-publish posts to a sub-account's
 * connected Meta accounts (Facebook Page + Instagram Business). Rides the
 * existing `metaConfig` connection (see {@link MetaConfig}); no separate
 * social credential store in v1.
 *
 * Posts live in a flat top-level collection `socialPosts/{id}` (same shape
 * as `quotes` / `events` — the operator's calendar + list are the primary
 * access paths). All writes go through Admin-SDK API routes; the client only
 * subscribes for the calendar, so Firestore rules keep `socialPosts`
 * server-write-only (mirrors `products`). Publishing is a QStash callback
 * fired at `scheduledAt`, identical to the broadcasts/automations pattern.
 *
 * Off-by-default contract: nothing here is read or written unless the agency
 * gate `socialPlannerEnabledByAgency` is on AND a Meta Page is connected.
 */

/** The platforms v1 can publish to. Both ride one Meta connection. */
export type SocialPlatform = "facebook" | "instagram";

/**
 * Lifecycle of a social post.
 *  - draft       — saved, not scheduled. Never auto-publishes.
 *  - scheduled   — a QStash job is queued to publish at `scheduledAt`.
 *  - publishing  — the publish callback has claimed the post (transactional
 *                  scheduled→publishing flip) and is calling the platform APIs.
 *  - published   — every target succeeded.
 *  - failed      — at least one target failed (see per-target `results`).
 */
export type SocialPostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

/** Per-platform publish outcome, stamped by the publish callback. */
export interface SocialPostTargetResult {
  platform: SocialPlatform;
  status: "pending" | "published" | "failed";
  /** FB post id or IG media id on success; null otherwise. */
  externalId: string | null;
  /** Meta's error text on failure; null otherwise. */
  error: string | null;
}

export interface SocialPostDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;

  /** Caption / post body. Shared across targets in v1. */
  caption: string;
  /**
   * Optional public https image URL. Required when `instagram` is a target
   * (the IG Content Publishing API is URL-based — no binary upload in v1).
   */
  imageUrl: string | null;
  /** Which platforms to publish to. Non-empty when scheduled. */
  targets: SocialPlatform[];

  status: SocialPostStatus;
  /** When the post should publish. Null for drafts. */
  scheduledAt: Timestamp | FieldValue | null;
  /** When the publish callback completed (success or failure). */
  publishedAt: Timestamp | FieldValue | null;

  /** Per-target outcomes — one entry per platform in `targets`. */
  results: SocialPostTargetResult[];
  /** QStash message id for the scheduled publish job (debug / future cancel). */
  qstashMessageId: string | null;

  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/** Max caption length accepted by the composer + validator. */
export const SOCIAL_CAPTION_MAX = 5000;
