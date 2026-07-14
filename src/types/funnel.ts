import type { Timestamp, FieldValue } from "firebase-admin/firestore";

/**
 * Sales funnel — a single-goal landing page that captures leads.
 *
 * In plain terms (this is what we teach the agent): a funnel is one simple web
 * page with ONE job — get a visitor to hand over their name and number in
 * exchange for something useful (a home value, a buyer's guide, listing
 * alerts). Every submission becomes a contact and kicks off your follow-up.
 *
 * Docs live at `subAccounts/{id}/funnels/{funnelId}`.
 */

export type FunnelGoalId =
  | "home_valuation"
  | "buyer_leads"
  | "listing_promo"
  | "email_list"
  | "buyer_consult"
  | "showing"
  | "open_house"
  | "luxury"
  | "seller_guide"
  | "seller_consult"
  | "market_report"
  | "investor_guide"
  | "neighborhood_guide"
  | "downsizing_guide"
  | "probate"
  | "divorce"
  | "relocation";

export type FunnelStatus = "draft" | "published";

export type FunnelTheme = "navy" | "light";

export interface FunnelContent {
  goal: FunnelGoalId;
  /** Big promise at the top. */
  headline: string;
  /** One supporting sentence. */
  subhead: string;
  /** 3–4 "what you get" bullets. */
  benefits: string[];
  /** Optional hero/background image URL. */
  imageUrl: string;
  /** The button label on the form (the action). */
  ctaLabel: string;
  /** Which fields to collect. Name is always on. */
  collectEmail: boolean;
  collectPhone: boolean;
  /** Shown after they submit. */
  thankYouMessage: string;
  theme: FunnelTheme;
  /** Optional public URL to a PDF/file — shown as a "Download now" link
   *  on the thank-you state (no upload infra; same convention as
   *  imageUrl / logoUrl). */
  downloadUrl?: string;
  /** When true, submit also creates a Deal at the "New" stage — parity
   *  with Forms' createDeal/dealTitleTemplate/dealValue settings. */
  createDeal?: boolean;
  /** Merge-tag-free template, e.g. "Lead from {{funnelName}}". */
  dealTitleTemplate?: string;
  dealValue?: number;
}

export interface FunnelDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string; // operator-facing label
  slug: string;
  status: FunnelStatus;
  content: FunnelContent;
  submissionCount: number;
  publishedAt: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
