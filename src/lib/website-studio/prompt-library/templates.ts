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

export type TemplateId =
  | "new-solo-agent"
  | "established-agent"
  | "buyer-specialist"
  | "listing-specialist"
  | "luxury-agent"
  | "commercial-broker"
  | "property-manager"
  | "team-lead"
  | "brokerage";

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

/**
 * An agent with a real track record and no website.
 *
 * The opposite problem to the new agent, and it needs the opposite brief.
 * Twenty years of work is the entire differentiator, and the failure here is a
 * site that buries it under the same generic positioning every new agent uses.
 * The constraint that stays is the one on honesty: real numbers only, from the
 * profile.
 */
const ESTABLISHED_AGENT: SiteTemplate = {
  id: "established-agent",
  name: "Established agent, first website",
  audience: "An experienced agent who has worked on referrals and never had a site",
  summary:
    "Leads with the track record: years in the business, areas known deeply, and the clients who vouch for you.",
  requires: [
    { capability: "businessProfile", whenMissing: "block" },
    { capability: "idx", whenMissing: "omit-section", section: "idx" },
    { capability: "reviews", whenMissing: "omit-section", section: "testimonials" },
    { capability: "webChat", whenMissing: "degrade" },
    { capability: "aiAgent", whenMissing: "degrade" },
  ],
  produces: ["header", "hero", "about", "specialties", "idx", "testimonials", "cta", "footer"],
  brief: `Build a first website for an agent with a long track record who has
worked on referrals and word of mouth until now.

Tone and substance:
- Lead with experience. Years in the business, the areas they know deeply, and
  the kind of client they have served longest. This is the whole reason someone
  picks them over a newer agent, and it should be visible before any scrolling.
- Use only the figures in their business profile. Do not invent transaction
  counts, sales volume, awards, rankings, or designations — a real record does
  not need padding, and a false production claim is a licensing problem.
- Someone who worked on referrals for years has a voice. Write the way they
  would speak to a past client, not the way a brochure speaks to a stranger.
- Their reviews are the strongest asset on the page. Where reviews exist, give
  them prominence rather than tucking them at the bottom.
- Describe homes and services. Never describe who a neighbourhood is for, who
  would "fit in", or the people who live there.

Structure:
- Hero: name, years of experience, areas served, and one clear action.
- About: how they work and what a client can expect, in their own voice.
- Specialties: the services they actually offer, from their profile.
- A closing call to action with their real contact details.

Keep it to one page. Someone whose business already works needs a credible
site they can point at, not a project.`,
};

/**
 * The specialty variants.
 *
 * Each differs only in who the page is written for and what that reader is
 * anxious about. Structure and constraints are shared on purpose: every one of
 * these carries the same honesty and Fair Housing rules, and duplicating them
 * per template is how one copy quietly drifts.
 */
function specialtyTemplate(input: {
  id: TemplateId;
  name: string;
  audience: string;
  summary: string;
  lead: string;
}): SiteTemplate {
  return {
    id: input.id,
    name: input.name,
    audience: input.audience,
    summary: input.summary,
    requires: [
      { capability: "businessProfile", whenMissing: "block" },
      { capability: "idx", whenMissing: "omit-section", section: "idx" },
      { capability: "reviews", whenMissing: "omit-section", section: "testimonials" },
      { capability: "webChat", whenMissing: "degrade" },
      { capability: "aiAgent", whenMissing: "degrade" },
    ],
    produces: ["header", "hero", "about", "specialties", "idx", "testimonials", "cta", "footer"],
    brief: `${input.lead}

Rules that apply to every page you build:
- Use only what is in their business profile. Do not invent transaction counts,
  sales volume, years of experience, awards, designations, or client names. A
  false production claim is a licensing problem, not a copy problem.
- Describe the property and the service. Never describe who a neighbourhood is
  for, who would "fit in" there, or the people who live in it.
- Write plainly. Name the actual areas and the actual services, and skip the
  superlatives that make every agent's site read the same.

Structure:
- Hero: who they are, what they do, where, and one clear action.
- About: how they work and what a client can expect, in their own voice.
- Specialties: the services they actually offer, from their profile.
- A closing call to action with their real contact details.`,
  };
}

const SPECIALTY_TEMPLATES: readonly SiteTemplate[] = [
  specialtyTemplate({
    id: "buyer-specialist",
    name: "Buyer's agent",
    audience: "An agent whose business is mostly buyers",
    summary: "Written for someone deciding whether they can buy, and who to trust with it.",
    lead: `Build a site for an agent who works mainly with buyers.

The reader is usually earlier and more uncertain than a seller: they are
working out what they can afford, how the process runs, and whether this agent
will be straight with them. Lead with clarity about the process and what
working together looks like, not with property inventory. Do not give financing
advice or suggest what someone can afford — point to a lender for that.`,
  }),
  specialtyTemplate({
    id: "listing-specialist",
    name: "Listing agent",
    audience: "An agent whose business is mostly sellers",
    summary: "Written for an owner weighing up what their home could do and who should handle it.",
    lead: `Build a site for an agent who works mainly with sellers.

The reader owns something valuable and is deciding who to trust with it. Lead
with the marketing and preparation this agent actually does — photography,
staging, pricing method, where the listing gets shown. Do not quote a value for
any property or imply what a home would sell for; that is a CMA conversation,
not a web page.`,
  }),
  specialtyTemplate({
    id: "luxury-agent",
    name: "Luxury / high-value homes",
    audience: "An agent working at the top of their market",
    summary: "Restrained, image-led, and written for a reader who dislikes being sold to.",
    lead: `Build a site for an agent working at the top end of their market.

Restraint is the register. This reader is put off by exclamation marks, stock
superlatives, and anything that reads like an advertisement. Fewer words,
larger photography, and specifics about discretion, private marketing, and
handling. Never imply exclusivity of clientele or who belongs in a property —
describe the service and the home only.`,
  }),
  specialtyTemplate({
    id: "commercial-broker",
    name: "Commercial",
    audience: "A broker working commercial property",
    summary: "Written for an investor or occupier reading for numbers and terms, not lifestyle.",
    lead: `Build a site for a commercial broker.

The reader is making a business decision and wants asset types, submarkets,
tenant or investor representation, and how deals get run. Drop residential
warmth entirely. Do not state or imply returns, cap rates, or investment
performance — those are figures for a specific deal, not a website.`,
  }),
  specialtyTemplate({
    id: "property-manager",
    name: "Property management",
    audience: "An operator managing rentals for owners",
    summary: "Written for an owner who wants the property handled without hearing about it.",
    lead: `Build a site for a property management operation.

The reader owns rentals and wants to stop thinking about them. Lead with what
is handled — tenant placement, maintenance, rent collection, reporting — and
how owners are kept informed. Be concrete about scope. Never describe desired
tenant characteristics in any way; tenant screening criteria belong in a
compliant application process, never on a public page.`,
  }),
  specialtyTemplate({
    id: "team-lead",
    name: "Team",
    audience: "A lead agent running a team under a brokerage",
    summary: "Written to show coverage and depth without implying an independent brokerage.",
    lead: `Build a site for a real-estate team operating under a brokerage.

Show the depth a team offers — availability, specialisation, coverage — and
introduce the people. The name must never imply the team is an independent
brokerage: the brokerage of record has to be identified clearly, as most states
require. Do not invent team members, roles, or headcount.`,
  }),
  specialtyTemplate({
    id: "brokerage",
    name: "Brokerage",
    audience: "A brokerage marketing to clients and to agents it wants to recruit",
    summary: "Serves two readers at once: clients looking for representation, and agents looking for a home.",
    lead: `Build a site for a brokerage.

Two audiences read this page: clients choosing representation, and agents
considering joining. Serve both without letting either dominate — clients
first, with a clear, separate path for agents. Lead with what the brokerage
stands for and how it supports its agents. Do not invent agent counts,
production volume, market share, or commission splits.`,
  }),
];

export const SITE_TEMPLATES: readonly SiteTemplate[] = [
  NEW_SOLO_AGENT,
  ESTABLISHED_AGENT,
  ...SPECIALTY_TEMPLATES,
];

export function getTemplate(id: string): SiteTemplate | null {
  return SITE_TEMPLATES.find((t) => t.id === id) ?? null;
}
