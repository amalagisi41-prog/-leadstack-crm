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
 * Neutral real-estate starter owned by AgentStack. Customer brands, contact
 * details, domains, and media must always come from that customer's account.
 */
export const REAL_ESTATE_AGENT_PRESET: WebsiteStudioPreset = {
  id: "real-estate-agent-starter",
  name: "Real Estate Agent Starter",
  description:
    "Start with an editable home-services network site inside AgentStack Website Studio.",
  sourceUrl: "",
  templateId: "coastal",
  slug: "my-real-estate-site",
  content: {
    agentName: "Your Name",
    title: "Local real estate guidance for your next move",
    brokerage: "",
    tagline: "Local expertise. Clear advice. Confident decisions.",
    bio: "Use this space to introduce your real estate business, the clients you serve, and the local expertise that makes your approach different.",
    phone: "",
    email: "",
    serviceAreas: "Your primary markets",
    specialties: [
      "Real estate",
      "Home buying",
      "Home selling",
      "Relocation",
      "Investment properties",
      "Local market guidance",
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
    ctaHeadline: "Ready to plan your next move?",
    ctaSubtext:
      "Tell us what you are looking for and choose the best next step for you.",
    metaTitle: "Your Name | Local Real Estate Professional",
    metaDescription:
      "Local guidance for buying, selling, relocating, and investing in real estate.",
    ogImageUrl: "",
  },
};
