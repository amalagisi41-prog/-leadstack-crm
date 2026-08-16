import type { Timestamp, FieldValue } from "firebase-admin/firestore";
import type { HeroVariant } from "@/lib/website-studio/templates";

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

export type AgentSiteSectionType =
  | "header"
  | "hero"
  | "about"
  | "specialties"
  | "idx"
  | "listings"
  | "testimonials"
  | "cta"
  | "footer";

export interface AgentSiteSection {
  /** Stable identity used by the editor when a section moves. */
  id: AgentSiteSectionType;
  type: AgentSiteSectionType;
  visible: boolean;
}

/**
 * Versioned visual-builder payload. Content stays separate so Zack, manual
 * editing, templates, and future Puck controls all operate on one site model.
 */
export interface AgentSiteComposition {
  version: 1;
  sections: AgentSiteSection[];
}

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

export interface AgentSiteCompliance {
  licenseStates: string;
  licenseNumber: string;
  privacyPolicyUrl: string;
  termsUrl: string;
  fairHousingStatement: string;
  smsConsentEnabled: boolean;
  smsConsentDisclosure: string;
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
  /** Optional on legacy drafts; required fields are enforced before publish. */
  compliance?: AgentSiteCompliance;
  // SEO (single-page site: one set of tags for the one published page).
  // Falls back to agentName/tagline/heroImageUrl when blank.
  metaTitle: string;
  metaDescription: string;
  ogImageUrl: string;
}

/** One turn in the AI Designer interview transcript. */
export interface DesignerTurn {
  role: "designer" | "agent";
  content: string;
}

/**
 * Visual overrides on top of the chosen template's design tokens. Every
 * field is optional — undefined falls back to the template default. Set
 * and validated via lib/website-studio/design.ts; `customCss` is scoped
 * there before it's ever persisted, since the renderer this feeds runs
 * live inside the dashboard during preview, not only the public site.
 */
export interface AgentSiteDesign {
  bg?: string;
  surface?: string;
  text?: string;
  muted?: string;
  accent?: string;
  accentText?: string;
  border?: string;
  fontDisplay?: string;
  fontBody?: string;
  radius?: number;
  heroVariant?: HeroVariant;
  customCss?: string;
}

export function emptyAgentSiteDesign(): AgentSiteDesign {
  return {};
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
  /** Missing on legacy documents; the renderer supplies the v1 default. */
  composition?: AgentSiteComposition;
  /** Visual overrides on top of the template's tokens. Defaults to {}. */
  design: AgentSiteDesign;
  /** The AI Designer interview so the agent can resume where they left off. */
  designerTranscript: DesignerTurn[];
  /** Which guided step the interview is on (index into the designer script). */
  designerStep: number;
  publishedAt: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  /** Approval is valid only while its fingerprint matches the current draft. */
  releaseAssurance?: AgentSiteReleaseApproval;
}

export interface AgentSiteReleaseApproval {
  fingerprint: string;
  passed: boolean;
  blockerCount: number;
  warningCount: number;
  approvedByUid: string;
  approvedAt: Timestamp | FieldValue | null;
}

export type AgentSiteRevisionSource =
  | "zack"
  | "content"
  | "structure"
  | "puck"
  | "publish"
  | "restore";

/** Immutable recovery point stored below the primary AgentStack site. */
export interface AgentSiteRevision {
  id: string;
  siteId: string;
  subAccountId: string;
  createdByUid: string;
  source: AgentSiteRevisionSource;
  label: string;
  templateId: AgentSiteTemplateId;
  slug: string;
  status: AgentSiteStatus;
  content: AgentSiteContent;
  composition: AgentSiteComposition;
  design: AgentSiteDesign;
  createdAt: Timestamp | FieldValue | null;
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
    compliance: {
      licenseStates: "",
      licenseNumber: "",
      privacyPolicyUrl: "",
      termsUrl: "",
      fairHousingStatement:
        "We are pledged to the letter and spirit of U.S. policy for the achievement of equal housing opportunity throughout the nation.",
      smsConsentEnabled: false,
      smsConsentDisclosure:
        "By providing your phone number, you agree to receive calls and text messages about your inquiry. Consent is not a condition of service. Message and data rates may apply. Reply STOP to opt out.",
    },
    metaTitle: "",
    metaDescription: "",
    ogImageUrl: "",
  };
}

/**
 * Fill in any field a stored document predates.
 *
 * Site docs are written once and read forever, so a doc created before a
 * field existed comes back from Firestore without it. The editor renders
 * things like `content.metaTitle.length`, which throws on `undefined` and
 * takes down the whole client with a blank "Application error" page.
 * Normalizing at every read boundary means adding a future field can never
 * break an existing site.
 */
export function normalizeAgentSiteContent(
  stored: Partial<AgentSiteContent> | null | undefined
): AgentSiteContent {
  const base = emptyAgentSiteContent();
  if (!stored) return base;
  const merged = { ...base, ...stored };
  // Array fields need their own guard: an explicit `null` in the document
  // would survive the spread and still break `.map`/`.join`.
  merged.specialties = Array.isArray(stored.specialties)
    ? stored.specialties
    : [];
  merged.galleryUrls = Array.isArray(stored.galleryUrls)
    ? stored.galleryUrls
    : [];
  merged.listings = Array.isArray(stored.listings) ? stored.listings : [];
  merged.testimonials = Array.isArray(stored.testimonials)
    ? stored.testimonials
    : [];
  // `compliance` is a nested object the publish checklist reads field by
  // field, so a partial one from an older doc needs filling too.
  merged.compliance = { ...base.compliance!, ...(stored.compliance ?? {}) };
  return merged;
}
