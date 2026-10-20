import type { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { ApprovalLevel, ComplianceScreen, Reversibility } from "@/lib/marketing/tool-registry";
import type { BoostTier } from "@/lib/marketing/listing-boost";
import type { PhotoCategoryMap } from "@/lib/marketing/photo-categories";

export type CampaignChannel =
  | "landingPage"
  | "facebook"
  | "instagram"
  | "email"
  | "sms"
  | "googleBusiness"
  | "linkedin"
  | "tiktok";

export type CampaignDraftStatus = "draft" | "needs-review" | "ready" | "approved";
export type CampaignWorkflowStep = "create" | "optimize" | "schedule" | "archive";

export interface ChannelDraft {
  channel: CampaignChannel;
  body: string;
  status: CampaignDraftStatus;
  approval: ApprovalLevel;
  reversibility: Reversibility;
  screens: ComplianceScreen[];
  findings: string[];
}

export interface ContentBrief {
  listingId: string;
  mlsId: string;
  title: string;
  description: string;
  strongestFeature: string;
  price: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string;
  images: string[];
  /**
   * Carried from the listing so brochure/landing-page rendering can order
   * `images` instead of trusting feed order. Absent on briefs built before an
   * agent categorized the listing — consumers must fall back to raw order.
   */
  photoCategories?: PhotoCategoryMap;
  disclaimer: string | null;
  boostTier: BoostTier | null;
  daysOnMarket: number | null;
  dataGaps: string[];
  channels: ChannelDraft[];
  lseo: LseoStrategy;
}

export interface LseoStrategy {
  score: number;
  searchTitle: string;
  metaDescription: string;
  primaryQuery: string;
  localSignals: string[];
  recommendations: string[];
  blockers: string[];
}

/** A generated asset's lifecycle — shared shape for both creative connectors below. */
export type GeneratedAssetStatus = "queued" | "processing" | "ready" | "failed";

/**
 * Creatify (image-to-video) job state for a campaign brief. Never set until
 * the operator explicitly requests a video — see lib/creative/creatify-client.ts.
 */
export interface VideoGenerationState {
  status: GeneratedAssetStatus;
  jobId: string;
  videoUrl: string | null;
  error: string | null;
  requestedByUid: string;
  requestedAt: Timestamp | FieldValue | null;
}

/**
 * Placid (branded template fill) render state for a campaign brief. The
 * template itself is designed once by the operator in Placid's own editor —
 * this only fills the listing's own verified facts into it. See
 * lib/creative/placid-client.ts.
 */
export interface CreativeImageState {
  status: GeneratedAssetStatus;
  templateId: string;
  imageUrl: string | null;
  error: string | null;
  requestedByUid: string;
  requestedAt: Timestamp | FieldValue | null;
}

export interface CampaignBriefDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  listingId: string;
  createdByUid: string;
  brief: ContentBrief;
  approvedChannels: CampaignChannel[];
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  workflowStep?: CampaignWorkflowStep;
  archivedAt?: Timestamp | FieldValue | null;
  schedulePlan?: Partial<Record<CampaignChannel, string | null>>;
  video?: VideoGenerationState | null;
  creativeImage?: CreativeImageState | null;
}

export interface CampaignApprovalAuditDoc {
  briefId: string;
  subAccountId: string;
  listingId: string;
  approvedByUid: string;
  approvedAt: Timestamp | FieldValue | null;
  channels: CampaignChannel[];
  screensCleared: ComplianceScreen[];
  decision?: "approved" | "declined";
  reason?: string;
}
