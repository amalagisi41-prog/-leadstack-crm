import type { Comparison } from "@/types/comparisons";

/**
 * GoHighLevel vs LeadStack — the flagship comparison page.
 *
 * GHL is the direct rival LeadStack is positioned head-to-head against, so
 * this page sees the highest converting search intent. Update pricing +
 * verification date when GHL changes their public tiers.
 *
 * Underlying-stack identifiers (Firebase, Twilio, Vapi, Resend, OpenRouter,
 * Vercel, Next.js, gitpage.site, specific AI model names, etc.) are
 * deliberately kept out of this file. Visitors shouldn't be able to
 * reconstruct LeadStack's architecture from the comparison page — that
 * information ships inside the repo they get after purchase.
 */
export const gohighlevelComparison: Comparison = {
  slug: "gohighlevel",
  competitorName: "GoHighLevel",
  competitorShortName: "GHL",
  metaTitle: "GoHighLevel vs LeadStack | All-in-One CRM Compared (2026)",
  metaDescription:
    "GoHighLevel vs LeadStack — feature, pricing, and ownership comparison. Why agencies are switching from $297/mo recurring to a self-hosted all-in-one CRM they own outright.",
  lastVerifiedDate: "June 2026",

  hero: {
    h1: "GoHighLevel vs LeadStack",
    subhead:
      "Both are all-in-one CRMs built for agencies. Only one of them lets you own the code, set your own prices, keep your client data on your own infrastructure, and walk away the day you decide to switch tools.",
    ctaLabel: "See LeadStack pricing",
  },

  pullQuote: {
    text: "GoHighLevel made the modern agency stack possible — one tool, one bill, every channel. LeadStack is the next step: the same surface area, but you own the code, the data, and the margin instead of renting them.",
    author: "The LeadStack team",
    role: "On why LeadStack exists",
  },

  painPoints: {
    heading: "Where GoHighLevel falls short",
    bullets: [
      {
        title: "$297 every month — for as long as you operate",
        body: "GoHighLevel's Unlimited tier is $297 per month, billed in perpetuity. There's no point at which you finish paying. Five years in, you've handed them roughly $17,800 and still don't own a single line of the platform you sell to your clients. The day you stop paying, the tool stops working.",
      },
      {
        title: "White-label is paint, not foundation",
        body: "GHL's white-label is real and well-executed — but it stops at the surface. You can change colors, logos, the login URL, the domain. You cannot change how the platform behaves, ship a feature your client asked for last Tuesday, or fork the codebase when GHL's product direction diverges from yours. Their roadmap is your roadmap.",
      },
      {
        title: "Their database holds your clients hostage",
        body: "Every contact, deal, conversation, and recorded call lives on GoHighLevel's infrastructure. Exporting is possible but partial — webhook history, recorded voice calls, attachment metadata, and automation execution logs are difficult to recover in usable shape. If GHL changes pricing, deprecates a feature, or you simply outgrow them, migration is a months-long project.",
      },
    ],
  },

  advantages: [
    {
      title: "You own the code, not a seat",
      body: "LeadStack is the full source code of an agency CRM you clone, deploy to your own cloud account, and brand as your own product. Every file — the UI, the API routes, the AI agent logic, the booking pages, the quote generator — is yours to read, modify, and extend. There is no platform behind LeadStack waiting to deprecate the feature you depend on.",
    },
    {
      title: "Pricing is a line on a vendor invoice, not a subscription",
      body: "After the one-time license, your only ongoing costs are the actual infrastructure your deployment consumes — cloud hosting, database storage, per-SMS, per-email, per-token AI. You pay your service providers directly at their published rates, with no platform markup baked into repackaged credits. Most agencies' total infrastructure spend is under $50/month for the first dozen sub-accounts.",
    },
    {
      title: "AI built on an open gateway — pick any model",
      body: "Web Chat, SMS auto-reply, and Voice agents all flow through a single AI gateway, configured per channel. One key routes turns to a fast default model, or you can override per channel to a heavier reasoning model from any of the major model families. When a better model ships, you switch with a config change — not a vendor partnership negotiation.",
    },
    {
      title: "White-label all the way down to the database",
      body: "Per-sub-account dedicated phone numbers. Per-sub-account verified email sending domains. Per-sub-account branding, API keys, webhook subscriptions, and a fully tenancy-scoped database so a leaked credential only ever sees one client's data. Every URL, every email, every SMS, every API request can come from the brand your client sees — because the data model was designed that way from line one.",
    },
  ],

  featureTable: {
    heading: "How LeadStack's base license compares to GoHighLevel's base plan",
    rows: [
      {
        label: "Unlimited sub-accounts",
        leadstack: true,
        competitor: false,
      },
      {
        label: "All-in-one CRM: contacts, pipeline, quotes, booking, calendar",
        leadstack: true,
        competitor: true,
      },
      {
        label: "AI Web Chat widget + SMS auto-reply + Voice agent",
        leadstack: true,
        competitor: false,
      },
      {
        label: "Google review requests (SMS + WhatsApp, auto + on-demand)",
        leadstack: true,
        competitor: true,
      },
      {
        label: "Premium support",
        leadstack: true,
        competitor: false,
      },
      {
        label: "Public API + webhooks included (idempotency, versioning)",
        leadstack: true,
        competitor: false,
      },
      {
        label: "Full source code access — modify any feature",
        leadstack: true,
        competitor: false,
      },
      {
        label: "Self-host on your own cloud account",
        leadstack: true,
        competitor: false,
      },
      {
        label: "Recurring monthly platform fee",
        leadstack: "$0",
        competitor: "$297/month",
      },
      {
        label: "Client data on your infrastructure",
        leadstack: true,
        competitor: false,
      },
      {
        label: "Per-sub-account dedicated email sending domain",
        leadstack: true,
        competitor: true,
      },
      {
        label: "Funnel / landing page builder",
        leadstack: true,
        competitor: true,
      },
      {
        label: "Social post scheduling (Facebook + Instagram)",
        leadstack: true,
        competitor: true,
      },
    ],
  },

  pricing: {
    heading: "Pricing compared honestly",
    leadstack: {
      headline: "One-time license + your real vendor costs",
      detail:
        "Pay for LeadStack once. The features GoHighLevel sells as paid add-ons — AI Employee, premium support — and capabilities it gates behind higher tiers — the full public API + webhooks — are all included with the license. For most agencies, monthly running costs come in under the price of a cup of coffee — the free tiers across the underlying providers are generous.",
      notes: [
        "AI agents (Web Chat + SMS + Voice): $0/month — included with the license (GoHighLevel's AI Employee is a $97/mo-per-sub-account add-on).",
        "Public API + webhooks: $0 — included with the license (GoHighLevel gates these to higher tiers).",
        "Premium support: $0/month — a direct line to the team comes with the license (GoHighLevel charges $500/month).",
        "Hosting, database, and email all run on generous free tiers that comfortably cover a small agency's first dozen sub-accounts.",
        "Typical all-in running cost for a small agency: around the price of a cup of coffee a month.",
        "SMS, email, and AI usage is billed directly by your providers at their published rates — the same usage GoHighLevel bills you for too, just without the platform markup. Apples-to-apples, it's a wash or cheaper.",
      ],
    },
    competitor: {
      headline: "$297/month — and the add-ons stack fast",
      detail:
        "GoHighLevel's Unlimited Plan is $297/month or $2,970/year billed annually. The features most agencies actually need — AI Employee on every sub-account, premium support, white-label mobile app — are paid add-ons stacked on top of the base.",
      notes: [
        "12 months of GHL Unlimited base at $297/mo = $3,564.",
        "AI Employee: $97/month per sub-account — add-on, not included in the $297 base. At 10 sub-accounts that's another $970/month.",
        "Premium Support: $500/month flat — account-level add-on, not included in the $297 base.",
        "Public API + webhooks: gated to higher tiers — not on GoHighLevel's entry ($97) plan.",
        "After 5 years the base alone is roughly $17,820 — with no ownership accrual.",
        "Additional charges for other premium features (white-label mobile app, agency pro tools).",
        "SMS and voice credits are billed through GHL at a markup over the underlying provider's published rates.",
      ],
    },
    summary:
      "For a typical agency, break-even versus a single month of GoHighLevel lands inside the first month — not the first year. From month two onward, every dollar is pure savings, and the platform you sell to your clients is yours, not rented. Run the numbers below.",
  },

  faq: {
    heading: "Frequently asked questions",
    items: [
      {
        question: "Is LeadStack a true GoHighLevel replacement?",
        answer:
          "Yes — for the work agencies do every day: contacts, pipeline, calendar, booking pages, quotes, automations, bulk email broadcasts, AI Web Chat + SMS + Voice agents, social post scheduling (Facebook + Instagram), Google review requests, dedicated per-sub-account phone numbers and sending domains, and a full public REST API with webhooks. It's the same surface area you sell today — delivered as code you own.",
      },
      {
        question: "Can I bring my clients across from GoHighLevel?",
        answer:
          "Yes, on your timeline. Contacts import via CSV and your other records come across through the public REST API. The smooth path most agencies take: onboard new clients straight onto LeadStack, run both side by side, and move existing clients at their natural renewal. No big-bang cutover, no pressure.",
      },
      {
        question: "How does the white-label work?",
        answer:
          "You deploy LeadStack to your own cloud under your own domain and set your brand in one config file — name, logo, tagline, support email, pricing. Every surface your clients touch renders as your brand: the landing page, every dashboard screen, transactional emails, public booking pages, the AI chat widget, and customer-facing quote pages. The LeadStack name never appears. And each sub-account can carry its own sending domain and dedicated phone number, so your clients see fully separate brands right down to the channel.",
      },
      {
        question: "What does it actually cost to run?",
        answer:
          "After the one-time license, a small agency runs on the generous free tiers across hosting, database, and email — around the price of a cup of coffee a month. GoHighLevel is $297/month for the platform alone, forever, before add-ons. The usage you'd pay either way — SMS, email, AI — you pay your providers directly, at their published rates, without a platform markup on top.",
      },
      {
        question: "Who owns my client data?",
        answer:
          "You do — completely. Every contact, deal, conversation, and call summary lives in your own cloud project, under your billing and your access control. There's no LeadStack-controlled database in the loop, and you can export everything at any time with your database vendor's standard tools. Your clients' data is your asset, not a vendor's leverage.",
      },
      {
        question: "Do I need to be a developer to run LeadStack?",
        answer:
          "No code, ever — once it's deployed, the entire CRM runs in the browser. Setup is a one-time, guided process: you create a few standard provider accounts and paste in the keys, with an AI coding assistant able to walk you through every step. There's nothing to write — just accounts to connect. Budget around a couple of hours if it's your first time and this isn't something you do every day; faster if it is. After that, it's just your CRM.",
      },
      {
        question: "What if I want to stop using LeadStack one day?",
        answer:
          "You keep everything. It's your code on your infrastructure with your data — so your deployment runs as long as you want it to, with or without us. That's the whole point of owning an asset instead of renting access: a SaaS disappears the day the company does; what you own doesn't.",
      },
    ],
  },

  finalCta: {
    headline: "Own your CRM. Stop renting it.",
    body: "LeadStack gives agencies the full GoHighLevel-style surface area as code they own, on infrastructure they control, with no recurring platform fee on top.",
    primaryCtaLabel: "See LeadStack pricing",
    primaryCtaHref: "/#pricing",
  },
};
