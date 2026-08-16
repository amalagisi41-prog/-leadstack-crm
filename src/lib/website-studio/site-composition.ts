import type {
  AgentSiteComposition,
  AgentSiteSection,
  AgentSiteSectionType,
} from "@/types/agent-site";

export const AGENT_SITE_SECTION_ORDER: readonly AgentSiteSectionType[] = [
  "header",
  "hero",
  "about",
  "specialties",
  "idx",
  "listings",
  "testimonials",
  "cta",
  "footer",
];

export const AGENT_SITE_REQUIRED_SECTIONS = new Set<AgentSiteSectionType>([
  "header",
  "hero",
  "cta",
  "footer",
]);

export const AGENT_SITE_SECTION_LABELS: Record<AgentSiteSectionType, string> = {
  header: "Header",
  hero: "Hero",
  about: "Agent introduction",
  specialties: "Services & specialties",
  idx: "IDX listings · full width",
  listings: "Featured listings",
  testimonials: "Testimonials",
  cta: "Contact call-to-action",
  footer: "Compliance footer",
};

export function defaultAgentSiteComposition(): AgentSiteComposition {
  return {
    version: 1,
    sections: AGENT_SITE_SECTION_ORDER.map((type) => ({
      id: type,
      type,
      visible: type !== "idx",
    })),
  };
}

function isSectionType(value: unknown): value is AgentSiteSectionType {
  return (
    typeof value === "string" &&
    AGENT_SITE_SECTION_ORDER.includes(value as AgentSiteSectionType)
  );
}

/**
 * Accepts persisted or user-supplied data without trusting its order, ids, or
 * booleans. Unknown/duplicate entries are dropped and missing sections are
 * appended, which keeps old documents forward-compatible.
 */
export function normalizeAgentSiteComposition(
  value: unknown
): AgentSiteComposition {
  const rawSections =
    value &&
    typeof value === "object" &&
    "sections" in value &&
    Array.isArray(value.sections)
      ? value.sections
      : [];
  const seen = new Set<AgentSiteSectionType>();
  const sections: AgentSiteSection[] = [];

  for (const raw of rawSections) {
    if (!raw || typeof raw !== "object" || !("type" in raw)) continue;
    const type = raw.type;
    if (!isSectionType(type) || seen.has(type)) continue;
    seen.add(type);
    const canHide = !AGENT_SITE_REQUIRED_SECTIONS.has(type);
    sections.push({
      id: type,
      type,
      visible:
        canHide && "visible" in raw && raw.visible === false ? false : true,
    });
  }

  for (const type of AGENT_SITE_SECTION_ORDER) {
    if (!seen.has(type)) {
      sections.push({ id: type, type, visible: type !== "idx" });
    }
  }

  return { version: 1, sections };
}
