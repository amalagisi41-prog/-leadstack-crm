import type { AgentSiteContent, AgentSiteTemplateId } from "@/types/agent-site";

export interface WebsiteStudioPreset {
  id: string;
  name: string;
  description: string;
  sourceUrl: string;
  templateId: AgentSiteTemplateId;
  slug: string;
  content: AgentSiteContent;
}

/**
 * Generic home-services network starter.
 *
 * This preset previously carried a real customer's business identity — their
 * name, positioning, tagline, bio, and meta copy — and it is offered to every
 * subscriber in the Website Studio gallery. That shipped one customer's
 * branding and marketing copy to every other customer, including competing
 * agents in the same market.
 *
 * A starter is platform content and must be generic. Customer sites belong in
 * that customer's own sub-account, never in the shared template registry.
 */
export const HOME_SERVICES_NETWORK_PRESET: WebsiteStudioPreset = {
  id: "home-services-network",
  name: "Home Services Network",
  description:
    "Start with an editable home-services network site inside AgentStack Website Studio.",
  sourceUrl: "",
  templateId: "coastal",
  slug: "home-services-network",
  content: {
    agentName: "",
    title: "Trusted home professionals · One connected network",
    brokerage: "",
    tagline: "Better homes start with the right people.",
    bio: "We connect homeowners with trusted professionals for buying, selling, improving, maintaining, and enjoying their homes. Start with your goal and we will help you find the right path and the right specialist.",
    phone: "",
    email: "",
    serviceAreas: "Local markets · Expanding network",
    specialties: [
      "Real estate",
      "Renovation",
      "Home services",
      "Design",
      "Maintenance",
      "Local expertise",
    ],
    logoUrl: "",
    headshotUrl: "",
    heroImageUrl: "",
    galleryUrls: [],
    instagram: "",
    facebook: "",
    linkedin: "",
    listings: [],
    testimonials: [],
    ctaHeadline: "Tell us what your home needs next.",
    ctaSubtext:
      "Share your project or property goal and we will connect you with the right next step.",
    metaTitle: "",
    metaDescription:
      "Connect with trusted professionals for buying, selling, improving, and maintaining your home — all in one network.",
    ogImageUrl: "",
  },
};
