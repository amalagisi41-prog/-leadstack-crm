import type { Timestamp, FieldValue } from "firebase-admin/firestore";

/**
 * The Agent Business Profile — AgentStack's central Knowledge Base.
 *
 * "Tell us about your business once. AgentStack handles the rest."
 *
 * This single doc (`subAccounts/{id}/businessProfile/main`) is the source of
 * truth every AI agent reads before acting. It's compiled into a compact
 * text block (see lib/business-profile/compile.ts) and injected into the
 * shared system prompt, so the AI receptionist, follow-up agent, listing
 * copy, buyer/seller intake, review-request and booking agents all speak
 * from the same playbook without separate setup.
 *
 * Everything is optional — a blank profile compiles to nothing and the AI
 * falls back to its persona. The more the agent fills in, the more grounded
 * every AI surface becomes.
 */

export type BrandVoice =
  | "professional"
  | "luxury"
  | "friendly"
  | "investor"
  | "casual"
  | "formal";

export const BRAND_VOICES: { id: BrandVoice; label: string; blurb: string }[] = [
  { id: "professional", label: "Professional", blurb: "Polished, trustworthy, clear." },
  { id: "friendly", label: "Friendly", blurb: "Warm, approachable, conversational." },
  { id: "luxury", label: "Luxury", blurb: "Refined, exclusive, high-touch." },
  { id: "investor", label: "Investor", blurb: "Direct, numbers-first, efficient." },
  { id: "casual", label: "Casual", blurb: "Relaxed and down-to-earth." },
  { id: "formal", label: "Formal", blurb: "Buttoned-up and precise." },
];

/** Services an agent offers — drives which funnels/workflows we recommend. */
export type ServiceSpecialty =
  | "buyers"
  | "sellers"
  | "investors"
  | "rentals"
  | "relocation"
  | "luxury"
  | "first_time_buyers"
  | "commercial";

export const SERVICE_SPECIALTIES: { id: ServiceSpecialty; label: string }[] = [
  { id: "buyers", label: "Buyers" },
  { id: "sellers", label: "Sellers" },
  { id: "first_time_buyers", label: "First-time buyers" },
  { id: "investors", label: "Investors" },
  { id: "rentals", label: "Rentals" },
  { id: "relocation", label: "Relocation" },
  { id: "luxury", label: "Luxury" },
  { id: "commercial", label: "Commercial" },
];

export interface BusinessFaq {
  q: string;
  a: string;
}

export interface BusinessProfileContent {
  // 1. Agent profile
  agentName: string;
  brokerage: string;
  licenseStates: string; // e.g. "NJ, NY"
  licenseNumber: string;
  phone: string;
  email: string;
  website: string;
  languages: string; // e.g. "English, Spanish"

  // 4. Market areas
  serviceAreas: string; // towns / neighborhoods served
  priceRanges: string; // typical price bands
  specialties: string; // free-text niche notes

  // 3. Offers & services
  services: ServiceSpecialty[];

  // 6. Communication style
  brandVoice: BrandVoice;

  // 2. Business rules
  businessHours: string; // human-readable, e.g. "Mon–Fri 9–6, Sat by appt"
  responsePreference: string; // how they like leads handled
  handoffRules: string; // when the AI should hand off to a human
  escalationRules: string; // what should trigger an alert to the agent

  // 5. Lead qualification
  qualificationRules: string; // budget/timeline/financing/pre-approval/motivation

  // 7. Compliance guardrails (defaults on)
  fairHousing: boolean;
  noLegalTaxAdvice: boolean;
  brokerageDisclosure: string; // required disclosure line, if any
  optOutLanguage: string; // e.g. "Reply STOP to opt out"

  // 8. Assets
  bio: string;
  headshotUrl: string;
  logoUrl: string;
  buyerGuideUrl: string;
  sellerGuideUrl: string;
  testimonials: string;
  vendors: string; // preferred lenders/attorneys/inspectors/photographers

  // 10. FAQs — approved answers the AI may quote verbatim
  faqs: BusinessFaq[];
}

export interface BusinessProfileDoc extends BusinessProfileContent {
  subAccountId: string;
  agencyId: string;
  updatedByUid: string;
  /** How "done" the profile is (0–100) — powers the onboarding progress UI. */
  completeness: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export const EMPTY_BUSINESS_PROFILE: BusinessProfileContent = {
  agentName: "",
  brokerage: "",
  licenseStates: "",
  licenseNumber: "",
  phone: "",
  email: "",
  website: "",
  languages: "",
  serviceAreas: "",
  priceRanges: "",
  specialties: "",
  services: [],
  brandVoice: "professional",
  businessHours: "",
  responsePreference: "",
  handoffRules: "",
  escalationRules: "",
  qualificationRules: "",
  fairHousing: true,
  noLegalTaxAdvice: true,
  brokerageDisclosure: "",
  optOutLanguage: "Reply STOP to opt out.",
  bio: "",
  headshotUrl: "",
  logoUrl: "",
  buyerGuideUrl: "",
  sellerGuideUrl: "",
  testimonials: "",
  vendors: "",
  faqs: [],
};
