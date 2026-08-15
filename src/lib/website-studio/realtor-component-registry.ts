import type { AgentSiteSectionType } from "@/types/agent-site";

export type RealtorComponentCategory =
  | "essential"
  | "property"
  | "proof"
  | "framework";

export type RealtorComponentDefinition = {
  section: AgentSiteSectionType;
  label: string;
  description: string;
  category: RealtorComponentCategory;
  required: boolean;
  complianceRole?: string;
  provenance: "AgentStack internal";
  license: "Proprietary application code";
  version: string;
  reviewer: string;
  dependencies: readonly string[];
  accessibilityStatus: "reviewed";
  approvedUse: string;
};

/**
 * Auditable source of truth for Website Studio blocks. External UI snippets
 * must not enter this list until dependency, license, and provenance review.
 */
const COMPONENTS = [
  {
    section: "header",
    label: "Header",
    description: "Brand, navigation, phone, and primary action.",
    category: "framework",
    required: true,
    provenance: "AgentStack internal",
    license: "Proprietary application code",
  },
  {
    section: "hero",
    label: "Hero",
    description: "Primary positioning, service area, and conversion action.",
    category: "essential",
    required: true,
    provenance: "AgentStack internal",
    license: "Proprietary application code",
  },
  {
    section: "about",
    label: "About",
    description: "Agent story, brokerage, credentials, and local expertise.",
    category: "essential",
    required: false,
    provenance: "AgentStack internal",
    license: "Proprietary application code",
  },
  {
    section: "specialties",
    label: "Specialties",
    description: "Buyer, seller, relocation, luxury, and investor services.",
    category: "essential",
    required: false,
    provenance: "AgentStack internal",
    license: "Proprietary application code",
  },
  {
    section: "idx",
    label: "IDX listings",
    description: "Tenant-scoped AgentStack IDX inventory.",
    category: "property",
    required: false,
    provenance: "AgentStack internal",
    license: "Proprietary application code",
  },
  {
    section: "listings",
    label: "Featured listings",
    description: "Curated properties and listing highlights.",
    category: "property",
    required: false,
    provenance: "AgentStack internal",
    license: "Proprietary application code",
  },
  {
    section: "testimonials",
    label: "Testimonials",
    description: "Client proof and transaction context.",
    category: "proof",
    required: false,
    provenance: "AgentStack internal",
    license: "Proprietary application code",
  },
  {
    section: "cta",
    label: "Contact CTA",
    description: "Compliant lead capture and next-step action.",
    category: "essential",
    required: true,
    complianceRole:
      "Consent language is controlled by the site compliance profile.",
    provenance: "AgentStack internal",
    license: "Proprietary application code",
  },
  {
    section: "footer",
    label: "Footer",
    description: "Brokerage, license, fair-housing, contact, and legal links.",
    category: "framework",
    required: true,
    complianceRole: "Always-on disclosure and legal-link surface.",
    provenance: "AgentStack internal",
    license: "Proprietary application code",
  },
] as const;

export const REALTOR_COMPONENT_REGISTRY: readonly RealtorComponentDefinition[] =
  COMPONENTS.map((component) => ({
    ...component,
    version: "1.0.0",
    reviewer: "AgentStack product engineering",
    dependencies: ["react", "@puckeditor/core@0.23.0"],
    accessibilityStatus: "reviewed" as const,
    approvedUse:
      "AgentStack-hosted real-estate websites rendered through the shared site renderer.",
  }));

export const REALTOR_COMPONENT_BY_SECTION = Object.fromEntries(
  REALTOR_COMPONENT_REGISTRY.map((component) => [component.section, component])
) as Record<AgentSiteSectionType, RealtorComponentDefinition>;
