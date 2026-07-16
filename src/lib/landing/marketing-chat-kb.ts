import {
  CUSTOM_BRAND,
  getMarketingPlanEntries,
  IDX_BROKER_NAME,
  MARKETING_ADD_ON_NAMES,
} from "@/config/landing";

const MARKETING_FAQ_FACTS = [
  {
    question: "Why switch from Chime, Follow Up Boss, or KvCORE?",
    answer:
      "AgentStack is positioned as a business operating system, not just a contact database. It tells agents what to do next, responds to leads automatically, and keeps follow-up moving without manual chasing.",
  },
  {
    question: "How fast do leads get a response?",
    answer:
      "Inbound leads are designed to get an automated response in under 60 seconds across SMS and email. The AI can also handle follow-up questions and book showings before the agent replies manually.",
  },
  {
    question: "Can contacts be imported from another CRM?",
    answer:
      "Yes. CSV import supports systems like Follow Up Boss, Chime, KvCORE, Zillow, Realtor.com, and Google Contacts, with fuzzy matching for names, emails, and phone numbers.",
  },
  {
    question: "Does AgentStack work for teams and brokerages?",
    answer:
      "Yes. Team and Broker plans support multiple agents, sub-accounts, and territory routing so inbound leads can be assigned to the right agent automatically.",
  },
  {
    question: "How does the AI work?",
    answer:
      "Operators fill out their Business Blueprint once. AgentStack uses that to configure the AI across inbound texts, web chat, and phone calls so it can answer questions, qualify leads, and route hot prospects to the human team.",
  },
  {
    question: "Is client data safe?",
    answer:
      "Data is owner-scoped, encrypted at rest, exportable as CSV, and never sold or shared.",
  },
] as const;

export function getMarketingChatKnowledgeChunks(): string[] {
  const plans = getMarketingPlanEntries()
    .map(({ tier }) => {
      const assisted =
        tier.cta === "Talk to us" || tier.cta === "Book a consultation";
      return [
        `${tier.name}: ${tier.blurb}`,
        `Monthly price: $${tier.priceMonthly}/month.`,
        `Annual price: $${tier.priceAnnual}/month when billed annually.`,
        assisted
          ? "This is a sales-assisted plan, so the visitor should be guided to talk to the team instead of instant checkout."
          : "This plan can start with the free-trial signup flow on /signup.",
        `Included: ${tier.features.join(", ")}.`,
      ].join(" ");
    })
    .join("\n\n");

  const faq = MARKETING_FAQ_FACTS.map(
    (item) => `Q: ${item.question}\nA: ${item.answer}`,
  ).join("\n\n");

  return [
    `AgentStack marketing overview:
- Brand: ${CUSTOM_BRAND.name}
- Tagline: ${CUSTOM_BRAND.tagline}
- Core promise: ${CUSTOM_BRAND.shortDescription}
- Best next step for ready buyers: send them to /signup for Solo or Team free-trial signup.
- Best next step for Broker or Luxury Broker prospects: guide them to talk with the team.
- Support email: ${CUSTOM_BRAND.supportEmail}
- ${IDX_BROKER_NAME} is the supported IDX provider for the current landing-page IDX workflow.`,
    `AgentStack pricing and plan facts:\n${plans}`,
    `AgentStack feature and add-on facts:
- Core workflow: capture leads, respond instantly, organize the pipeline, nurture automatically, and close deals.
- AI works across SMS, web chat, and voice.
- Territory routing, booking pages, reviews, and IDX are part of the marketing story.
- Add-ons currently highlighted on the site include ${MARKETING_ADD_ON_NAMES.aiWebsiteStudio}, ${MARKETING_ADD_ON_NAMES.customWebsiteBuild}, ${MARKETING_ADD_ON_NAMES.reviewManager}, ${MARKETING_ADD_ON_NAMES.googleBusinessProfile}, ${MARKETING_ADD_ON_NAMES.googleAdsManagement}, ${MARKETING_ADD_ON_NAMES.socialPlanner}, ${MARKETING_ADD_ON_NAMES.aiListingCopy}, and ${MARKETING_ADD_ON_NAMES.whiteGloveSetup}.`,
    `AgentStack marketing FAQ facts:\n${faq}`,
  ];
}
