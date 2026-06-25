import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Affiliate program is gated on LANDING_VARIANT === "leadstack" everywhere.
 * Buyer clones ship with LANDING_VARIANT = "custom" so every affiliate
 * touchpoint (auto-enrollment in the webhook, ?ref capture, /affiliate/*
 * pages, /api/affiliate/* routes) silently no-ops or 404s.
 *
 * Commission policy (locked at launch):
 *  - Rate: 40% of the founders cohort sale price
 *  - Attribution: last-click, 30-day cookie window
 *  - Self-referral: blocked (buyer email === affiliate email → no credit)
 *  - Enrollment: every buyer auto-enrolled at purchase
 *  - Eligibility: buyers-only (manual exceptions for non-buyers via owner)
 */

export type AffiliateStatus = "active" | "paused" | "banned";

export interface Affiliate {
  id: string;
  email: string;
  code: string;
  /** Display name, pulled from Stripe `customer_details.name` when available. */
  displayName: string | null;
  status: AffiliateStatus;
  /** Whole-number percentage of sale credited per referral (e.g. 40 = 40%). */
  commissionPct: number;
  /** Lifetime totals — updated atomically when referral status changes. */
  referralCount: number;
  pendingCommissionCents: number;
  paidCommissionCents: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export type ReferralStatus = "pending" | "paid" | "voided";

/**
 * One row per unique-visitor-per-day-per-code. The doc id is a deterministic
 * composite so repeated visits from the same IP on the same day for the
 * same affiliate code collapse into a single doc — keeps Firestore writes
 * proportional to real reach instead of bot/spam traffic.
 */
export interface Click {
  id: string;
  affiliateCode: string;
  /** SHA-256 hash of visitor IP, salted with AUTOMATIONS_TOKEN_SECRET. */
  ipHash: string;
  userAgent: string;
  landingPath: string;
  referrer: string | null;
  /** YYYYMMDD for cheap aggregation queries. */
  dayKey: string;
  createdAt: Timestamp | FieldValue | null;
}

export interface Referral {
  id: string;
  /** Doc id of the affiliate that earned this commission. */
  affiliateId: string;
  /** Their code at the time of attribution — denormalized for analytics. */
  affiliateCode: string;
  /** Stripe checkout session id of the purchase that triggered this credit. */
  purchaseSessionId: string;
  /** Buyer email captured from Stripe customer_details. */
  buyerEmail: string;
  /** Final paid amount on the Stripe session. */
  amountPaidCents: number;
  /** Commission owed to the affiliate, computed at credit time. */
  commissionCents: number;
  status: ReferralStatus;
  /** Set by the agency owner when the payout is sent. */
  paidOutAt: Timestamp | FieldValue | null;
  /** Free-text note attached when marking paid (e.g. "PayPal txn ABC123"). */
  paidOutNote: string | null;
  createdAt: Timestamp | FieldValue | null;
}
