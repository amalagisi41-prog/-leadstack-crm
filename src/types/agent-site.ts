import type { Timestamp, FieldValue } from "firebase-admin/firestore";

/**
 * Website Studio — an AI-guided, template-based agent website.
 *
 * An agent picks a premium white-label template, uploads media, and the AI
 * "Designer" interviews them step by step to fill in their profile + site
 * copy. The result renders as a self-hosted one-page agent site.
 *
 * Docs live at `subAccounts/{id}/agentSites/{siteId}` — a subcollection so an
 * agent (or a brokerage sub-account) can hold more than one site.
 */

/** Ids of the premium templates curated in lib/website-studio/templates.ts. */
export type AgentSiteTemplateId = "luxe" | "coastal" | "metro";

export type AgentSiteStatus = "draft" | "published";

/** A single showcased listing / featured property card. */
export interface AgentSiteListing {
  title: string;
  price: string;
  location: string;
  imageUrl: string;
  status: string; // "For Sale" | "Just Sold" | "Pending" | free text
}

export interface AgentSiteTestimonial {
  quote: string;
  author: string;
  detail: string; // e.g. "Sold in Westport, CT"
}

/**
 * All the agent-supplied content that fills a template. Every field is
 * optional so a half-finished draft persists cleanly; the renderer falls
 * back to sensible placeholders for anything blank.
 */
export interface AgentSiteContent {
  // Identity
  agentName: string;
  title: string; // "REALTOR® · Luxury Specialist"
  brokerage: string;
  tagline: string; // hero headline
  bio: string;
  // Contact
  phone: string;
  email: string;
  serviceAreas: string; // "Fairfield County, CT"
  specialties: string[]; // ["Luxury homes", "First-time buyers"]
  // Media (hosted https URLs in v1)
  logoUrl: string;
  headshotUrl: string;
  heroImageUrl: string;
  galleryUrls: string[];
  // Social
  instagram: string;
  facebook: string;
  linkedin: string;
  // Rich sections
  listings: AgentSiteListing[];
  testimonials: AgentSiteTestimonial[];
  ctaHeadline: string;
  ctaSubtext: string;
}

/** One turn in the AI Designer interview transcript. */
export interface DesignerTurn {
  role: "designer" | "agent";
  content: string;
}

export interface AgentSiteDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  templateId: AgentSiteTemplateId;
  slug: string;
  status: AgentSiteStatus;
  content: AgentSiteContent;
  /** The AI Designer interview so the agent can resume where they left off. */
  designerTranscript: DesignerTurn[];
  /** Which guided step the interview is on (index into the designer script). */
  designerStep: number;
  publishedAt: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export function emptyAgentSiteContent(): AgentSiteContent {
  return {
    agentName: "",
    title: "",
    brokerage: "",
    tagline: "",
    bio: "",
    phone: "",
    email: "",
    serviceAreas: "",
    specialties: [],
    logoUrl: "",
    headshotUrl: "",
    heroImageUrl: "",
    galleryUrls: [],
    instagram: "",
    facebook: "",
    linkedin: "",
    listings: [],
    testimonials: [],
    ctaHeadline: "",
    ctaSubtext: "",
  };
}
