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
 * First-party Artisan Home Network starter migration. It imports editable
 * positioning and structure only; contact details and media remain blank
 * until the subscriber approves and supplies them.
 */
export const ARTISAN_HOME_NETWORK_PRESET: WebsiteStudioPreset = {
  id: "artisan-home-network",
  name: "Artisan Home Network",
  description:
    "Start with an editable home-services network site inside AgentStack Website Studio.",
  sourceUrl: "",
  templateId: "coastal",
  slug: "artisan-home-network",
  content: {
    agentName: "Artisan Home Network",
    title: "Trusted home professionals · One connected network",
    brokerage: "",
    tagline: "Better homes start with the right people.",
    bio: "Artisan Home Network connects homeowners with trusted professionals for buying, selling, improving, maintaining, and enjoying their homes. Start with your goal and we will help you find the right path and the right specialist.",
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
  },
};
