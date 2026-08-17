import type { AgentSiteSectionType } from "@/types/agent-site";
import type { TemplateRequirement } from "./capabilities";

/**
 * Starting points for the Website Studio, as manifests rather than prompts.
 *
 * A bare prompt string cannot be trusted to describe a site, because the
 * sentence "embed my active listings and reviews" is a wish, not a capability.
 * A manifest states what the template needs, what it will build, and what to
 * do about each missing piece, so the composer can ask for a site that can
 * actually be filled.
 *
 * The briefs live in the repo on purpose. They are marketing copy for
 * regulated real-estate advertising: they get reviewed, diffed, and screened
 * for Fair Housing language at authoring time, which none of that is possible
 * for a string a user pastes in. Adding a template means a pull request, not a
 * settings field.
 */

export type TemplateId = "new-solo-agent";

export interface SiteTemplate {
  id: TemplateId;
  /** Shown on the picker card. */
  name: string;
  /** One line: who this is for. */
  audience: string;
  /** What they get, before capabilities are resolved. */
  summary: string;
  requires: readonly TemplateRequirement[];
  /** Blocks this template builds when everything is available. */
  produces: readonly AgentSiteSectionType[];
  /**
   * The brief handed to Zack. Written as instructions about structure and
   * intent, never as finished copy: the copy has to come from the agent's own
   * profile or it is a template with their name pasted on.
   */
  brief: string;
}

/**
 * A newly licensed agent with no website, no listings history, and no reviews.
 *
 * This is the hardest starting point in real estate and the most common one.
 * The instinct is to hide the inexperience behind volume — stock photography,
 * invented statistics, "millions sold" — and that is exactly what produces a
 * site indistinguishable from every other new agent's, and what gets an agent
 * in trouble. The brief pushes the other way: say true things specifically.
 */
const NEW_SOLO_AGENT: SiteTemplate = {
  id: "new-solo-agent",
  name: "New agent, first website",
  audience: "A solo agent building their first site from scratch",
  summary:
    "A clear one-page site: who you are, the areas you serve, how you work, and an obvious way to reach you.",
  requires: [
    // Without this there is nothing specific to write, and the result is
    // filler with the agent's name on it.
    { capability: "businessProfile", whenMissing: "block" },
    { capability: "idx", whenMissing: "omit-section", section: "idx" },
    { capability: "reviews", whenMissing: "omit-section", section: "testimonials" },
    { capability: "webChat", whenMissing: "degrade" },
    { capability: "aiAgent", whenMissing: "degrade" },
  ],
  produces: ["header", "hero", "about", "specialties", "idx", "testimonials", "cta", "footer"],
  brief: `Build a first website for a newly licensed real estate agent, using only
the details in their business profile.

Tone and substance:
- Write plainly and specifically. Name the actual areas they serve and the
  actual kind of client they work with. Generic superlatives make every new
  agent's site identical.
- Do not invent transaction counts, sales volume, years of experience, awards,
  team size, or client names. If a number is not in their profile it does not
  go on the page. A new agent's honest site beats an impressive false one, and
  false production claims are a licensing problem.
- Lead with how they work and what a client can expect from them, since they
  cannot yet lead with a track record.
- Describe homes and services. Never describe who a neighbourhood is for, who
  would "fit in", or the people who live there.

Structure:
- Hero: their name, the areas they serve, and one clear action.
- About: how they work and why someone should call them, in their own voice.
- Specialties: the services they actually offer, from their profile.
- A closing call to action with their real contact details.

Keep it to one page. A new agent needs a site they will keep current, not a
nine-page site that goes stale in a month.`,
};

export const SITE_TEMPLATES: readonly SiteTemplate[] = [NEW_SOLO_AGENT];

export function getTemplate(id: string): SiteTemplate | null {
  return SITE_TEMPLATES.find((t) => t.id === id) ?? null;
}
