import type { FunnelContent, FunnelGoalId } from "@/types/funnel";

/**
 * Goal-based funnel starters + the guided wizard definition.
 *
 * Everything here is written for a non-technical real estate agent who may
 * never have heard the word "funnel." Each goal pre-fills a complete, working
 * page so the agent edits real words instead of staring at a blank canvas.
 */

export interface FunnelGoal {
  id: FunnelGoalId;
  /** Plain-language name of the goal. */
  label: string;
  /** One line: what this page does, in agent terms. */
  plain: string;
  emoji: string;
  /** Pre-filled starting content the agent then tweaks. */
  starter: Omit<FunnelContent, "goal" | "theme">;
}

export const FUNNEL_GOALS: FunnelGoal[] = [
  {
    id: "home_valuation",
    label: "Get home-value requests",
    plain: "Homeowners tell you their address to find out what their home is worth — a warm seller lead.",
    emoji: "🏡",
    starter: {
      headline: "What's your home worth in today's market?",
      subhead: "Get a free, no-obligation home value estimate prepared by a local expert — usually within 24 hours.",
      benefits: [
        "A real valuation from a local agent, not a robot guess",
        "Recent nearby sales that affect your price",
        "No cost and no pressure to list",
      ],
      imageUrl: "",
      ctaLabel: "Get My Free Home Value",
      collectEmail: true,
      collectPhone: true,
      thankYouMessage: "Thanks! I'll prepare your home value estimate and reach out shortly.",
    },
  },
  {
    id: "buyer_leads",
    label: "Capture buyer leads",
    plain: "Buyers sign up to get matched with homes — you build a list of people actively looking.",
    emoji: "🔑",
    starter: {
      headline: "Be the first to see new listings that fit you",
      subhead: "Tell me what you're looking for and I'll send you matching homes the moment they hit the market.",
      benefits: [
        "New listings before they show up on the big sites",
        "Only homes that match your budget and area",
        "A local agent in your corner, free to work with",
      ],
      imageUrl: "",
      ctaLabel: "Send Me Matching Homes",
      collectEmail: true,
      collectPhone: true,
      thankYouMessage: "You're on the list! I'll start sending you matching homes right away.",
    },
  },
  {
    id: "listing_promo",
    label: "Promote a specific listing",
    plain: "Show off one property and collect people who want a showing or more info.",
    emoji: "📸",
    starter: {
      headline: "Just listed — book your private showing",
      subhead: "A beautiful home just hit the market. Leave your details and I'll get you in to see it before it's gone.",
      benefits: [
        "Photos, price, and full details",
        "Skip the line — book a private showing",
        "Ask me anything about the home or neighborhood",
      ],
      imageUrl: "",
      ctaLabel: "Book My Showing",
      collectEmail: true,
      collectPhone: true,
      thankYouMessage: "Got it! I'll reach out to set up your showing.",
    },
  },
  {
    id: "email_list",
    label: "Grow your contact list",
    plain: "Offer a helpful free guide so people join your list — leads you can nurture over time.",
    emoji: "📩",
    starter: {
      headline: "The free guide every first-time buyer needs",
      subhead: "Download my step-by-step guide to buying your first home without the stress or surprises.",
      benefits: [
        "What to do before you start shopping",
        "How much home you can really afford",
        "The mistakes that cost first-time buyers the most",
      ],
      imageUrl: "",
      ctaLabel: "Send Me the Free Guide",
      collectEmail: true,
      collectPhone: false,
      thankYouMessage: "Check your email — your free guide is on the way!",
    },
  },
  {
    id: "buyer_consult",
    label: "Book a buyer consultation",
    plain: "Buyers book a free consultation to figure out their budget and plan before they start touring homes.",
    emoji: "🗓️",
    starter: {
      headline: "Not sure where to start? Let's talk it through.",
      subhead: "Book a free, no-pressure buyer consultation and walk away with a clear game plan for your search.",
      benefits: [
        "A straight answer on what you can afford",
        "A tour of neighborhoods that fit your budget",
        "No obligation to work with me after we talk",
      ],
      imageUrl: "",
      ctaLabel: "Book My Free Consultation",
      collectEmail: true,
      collectPhone: true,
      thankYouMessage: "Thanks! I'll reach out shortly to find a time that works for you.",
    },
  },
  {
    id: "showing",
    label: "Schedule a showing",
    plain: "A visitor requests a showing time for a specific home — a hot, ready-to-move buyer lead.",
    emoji: "🔓",
    starter: {
      headline: "Ready to see it in person? Let's get you in.",
      subhead: "Grab a showing time that works for your schedule — I'll confirm within a few hours.",
      benefits: [
        "Pick a time that fits your schedule",
        "A local agent to answer questions on-site",
        "No pressure — just a look",
      ],
      imageUrl: "",
      ctaLabel: "Schedule My Showing",
      collectEmail: true,
      collectPhone: true,
      thankYouMessage: "Got it! I'll confirm your showing time shortly.",
    },
  },
  {
    id: "open_house",
    label: "Open house registration",
    plain: "Visitors register ahead of an open house so you know who's coming and can follow up after.",
    emoji: "🏠",
    starter: {
      headline: "Join us for the open house — save your spot",
      subhead: "Register below so I know to expect you, and I'll send a reminder the morning of.",
      benefits: [
        "Skip the sign-in sheet at the door",
        "Get a reminder the morning of the event",
        "Ask questions before you even arrive",
      ],
      imageUrl: "",
      ctaLabel: "Register for the Open House",
      collectEmail: true,
      collectPhone: false,
      thankYouMessage: "You're registered! See you at the open house.",
    },
  },
  {
    id: "luxury",
    label: "Luxury buyer inquiry",
    plain: "A discreet, higher-touch intake for luxury buyers looking for on- and off-market properties.",
    emoji: "💎",
    starter: {
      headline: "Exceptional homes deserve a discreet, expert approach",
      subhead: "Tell me what you're looking for and I'll curate a private list of luxury properties that match — on and off market.",
      benefits: [
        "Access to off-market and coming-soon listings",
        "A dedicated, discreet point of contact",
        "Guidance tailored to the luxury market",
      ],
      imageUrl: "",
      ctaLabel: "Request a Private Consultation",
      collectEmail: true,
      collectPhone: true,
      thankYouMessage: "Thank you — I'll be in touch personally and discreetly.",
    },
  },
  {
    id: "seller_guide",
    label: "Seller's guide download",
    plain: "Sellers download a free guide in exchange for their email — a warm seller lead to nurture.",
    emoji: "📘",
    starter: {
      headline: "The seller's guide that helps you net more, with less stress",
      subhead: "Download my free step-by-step guide to pricing, prepping, and selling your home for top dollar.",
      benefits: [
        "How to price it right the first time",
        "Low-cost updates that pay off at closing",
        "What to expect at every stage of the sale",
      ],
      imageUrl: "",
      ctaLabel: "Send Me the Free Guide",
      collectEmail: true,
      collectPhone: false,
      thankYouMessage: "Check your email — your free seller's guide is on the way!",
    },
  },
];

export function getFunnelGoal(id: FunnelGoalId): FunnelGoal {
  return FUNNEL_GOALS.find((g) => g.id === id) ?? FUNNEL_GOALS[0];
}

/** The ordered wizard steps, each with a plain-language teaching note. */
export interface FunnelStep {
  key: string;
  title: string;
  /** Teaches the agent WHY this step matters, in plain words. */
  teach: string;
}

export const FUNNEL_STEPS: FunnelStep[] = [
  {
    key: "goal",
    title: "What do you want this page to do?",
    teach: "A funnel is just one web page with a single job. Pick the job — everything else fills in from here, and you can change any of it.",
  },
  {
    key: "headline",
    title: "Your headline & promise",
    teach: "This is the big line visitors read first. Make a clear promise about what they get. We've written a strong starting point — edit it to sound like you.",
  },
  {
    key: "benefits",
    title: "What they get",
    teach: "Three short bullets that answer \"what's in it for me?\" Keep them specific and benefit-focused — this is what convinces someone to fill in the form.",
  },
  {
    key: "form",
    title: "What to ask for",
    teach: "The fewer fields you ask for, the more people submit. Name is always collected. Turn on email and/or phone depending on how you'll follow up.",
  },
  {
    key: "design",
    title: "Look & photo",
    teach: "Add a photo (a listing or a local landmark works great) and pick a color theme. Optional — it looks good without one.",
  },
  {
    key: "publish",
    title: "Name it & publish",
    teach: "Give it a name only you see, then publish to get a shareable link. Put that link in texts, emails, social bios, or ads. Every submission becomes a contact and starts your follow-up automatically.",
  },
];
