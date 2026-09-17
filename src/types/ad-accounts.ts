import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Per-sub-account ad platform account tracking — one row per ad account the
 * operator's client runs (e.g. their Meta Ads account, their Google Ads
 * account). Lives alongside the client's monthly retainer (see
 * `SubAccountDoc.monthlyRetainerCents` in `src/types/tenancy.ts`) on the
 * "Ad Spend & Billing" page under a sub-account's Marketing section — one
 * place to see what a client pays the agency next to what the agency spends
 * running their ads, per platform.
 *
 * v1 is manual entry only (`source: "manual"`) — there is no live Meta Ads /
 * Google Ads API sync yet. Both require their own OAuth grant (Meta's
 * `ads_read` scope needs its own App Review, separate from the Messenger/IG
 * scopes already gated in this repo; Google Ads needs a developer token,
 * a manual Google review). `source` and the optional `externalAccountId`
 * field exist now so a future live-sync pass is additive rather than a
 * schema migration.
 *
 * Flat top-level collection (like `products` / `quotes` / `socialPosts`),
 * not a subcollection — matches this codebase's established preference for
 * flat collections carrying tenancy keys over subcollections-of-subcollections.
 */

export type AdAccountPlatform = "meta" | "google" | "other";

export interface AdAccountDoc {
  id: string;

  // ── Tenancy ───────────────────────────────────────────────────────
  agencyId: string;
  subAccountId: string;
  createdByUid: string;

  // ── Fields ───────────────────────────────────────────────────────
  platform: AdAccountPlatform;
  /** Operator-friendly name, e.g. "Acme Realty — Meta Ads". */
  label: string;
  /** Integer cents in `currency`. Manually entered in v1. */
  monthlySpendCents: number;
  /** ISO 4217. Defaults to "USD". */
  currency: string;
  /** "manual" today; a future live-sync pass adds "live" as a possible value. */
  source: "manual";
  /** Reserved for a future live-sync pass (the platform's own account id). Null in v1. */
  externalAccountId: string | null;
  notes: string;

  // ── Audit ────────────────────────────────────────────────────────
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export const DEFAULT_AD_ACCOUNT: Omit<
  AdAccountDoc,
  | "id"
  | "agencyId"
  | "subAccountId"
  | "createdByUid"
  | "createdAt"
  | "updatedAt"
> = {
  platform: "meta",
  label: "",
  monthlySpendCents: 0,
  currency: "USD",
  source: "manual",
  externalAccountId: null,
  notes: "",
};
