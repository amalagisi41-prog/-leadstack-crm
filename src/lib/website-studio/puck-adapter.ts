import type { Data } from "@puckeditor/core";
import type {
  AgentSiteComposition,
  AgentSiteSectionType,
} from "@/types/agent-site";
import { normalizeAgentSiteComposition } from "./site-composition";

export const PUCK_SECTION_COMPONENTS: Record<AgentSiteSectionType, string> = {
  header: "SiteHeader",
  hero: "Hero",
  about: "About",
  specialties: "Specialties",
  idx: "IdxListings",
  listings: "FeaturedListings",
  testimonials: "Testimonials",
  cta: "ContactCta",
  footer: "SiteFooter",
};

const SECTION_BY_COMPONENT = Object.fromEntries(
  Object.entries(PUCK_SECTION_COMPONENTS).map(([section, component]) => [
    component,
    section,
  ])
) as Record<string, AgentSiteSectionType>;

export function compositionToPuckData(
  composition?: AgentSiteComposition
): Data {
  const normalized = normalizeAgentSiteComposition(composition);
  return {
    root: { props: { title: "Agent website" } },
    content: normalized.sections
      .filter((section) => section.visible)
      .map((section) => ({
        type: PUCK_SECTION_COMPONENTS[section.type],
        props: { id: section.id },
      })),
  };
}

export function puckDataToComposition(
  data: Pick<Data, "content">,
  previous?: AgentSiteComposition
): AgentSiteComposition {
  const prior = normalizeAgentSiteComposition(previous);
  const visibleTypes = data.content
    .map((component) => SECTION_BY_COMPONENT[String(component.type)])
    .filter((type): type is AgentSiteSectionType => Boolean(type));
  const visible = new Set(visibleTypes);
  const hidden = prior.sections
    .map((section) => section.type)
    .filter((type) => !visible.has(type));

  return normalizeAgentSiteComposition({
    version: 1,
    sections: [...visibleTypes, ...hidden].map((type) => ({
      id: type,
      type,
      visible: visible.has(type),
    })),
  });
}
