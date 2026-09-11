import type { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { ApprovalLevel, ComplianceScreen, Reversibility } from "@/lib/marketing/tool-registry";
import type { BoostTier } from "@/lib/marketing/listing-boost";

export type CampaignChannel =
  | "landingPage"
  | "facebook"
  | "instagram"
  | "email"
  | "sms"
  | "googleBusiness";

export type CampaignDraftStatus = "draft" | "needs-review" | "ready" | "approved";

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
}

export interface CampaignApprovalAuditDoc {
  briefId: string;
  subAccountId: string;
  listingId: string;
  approvedByUid: string;
  approvedAt: Timestamp | FieldValue | null;
  channels: CampaignChannel[];
  screensCleared: ComplianceScreen[];
}
