import type { Comparison } from "@/types/comparisons";
import {
  HOMEPAGE_DESCRIPTION,
  SOLO_PRICE_LINE,
  SOLO_MONTHLY_TERMS,
  SOLO_CANCELLATION,
} from "@/lib/public-site/offer";

// The public Solo offer, rather than the former source-code license.
export const gohighlevelComparison: Comparison = {
  slug: "gohighlevel",
  competitorName: "GoHighLevel",
  competitorShortName: "GHL",
  metaTitle: "AgentStack CRM vs GoHighLevel — Built for Realtors",
  metaDescription:
    "AgentStack CRM vs GoHighLevel: a workspace built for realtors, guided six-step setup, and AgentStack Solo at $99/month. Compare the workflow and current plans.",
  lastVerifiedDate: "November 23, 2026",
  hero: {
    h1: "AgentStack CRM vs GoHighLevel: built for realtors",
    subhead: `Built to replace GoHighLevel — without the parts that were never made for agents. Keep buyer inquiries, listing appointments, showings, and offers in one workspace. ${SOLO_PRICE_LINE}.`,
    ctaLabel: "See the $99/month Solo plan",
  },
  pullQuote: {
    text: "Your next step should be following up with a buyer or preparing for a listing appointment. AgentStack CRM gives that work a clear home, with a guided setup built around your real estate business.",
    author: "The AgentStack CRM team",
    role: "The operating system for realtors",
  },
  painPoints: {
    heading: "Why agents leave GoHighLevel",
    bullets: [
      {
        title: "Less setup to translate",
        body: "A broad marketing platform can be powerful, but a solo agent still needs to map it to buyers, sellers, their sphere, and farm areas. AgentStack CRM starts with that real estate context.",
      },
      {
        title: "A clearer daily workflow",
        body: "Bring people, deals, tasks, calendar, lead forms, and booking pages into one workspace. Follow a lead from the first inquiry through appointments and closing.",
      },
      {
        title: "One clear Solo offer",
        body: `${SOLO_PRICE_LINE}. See what is Live and what remains Private Preview before subscribing. Optional add-ons require your approval.`,
      },
    ],
  },
  advantages: [
    { title: "Built exclusively for realtors", body: HOMEPAGE_DESCRIPTION },
    {
      title: "A guided six-step Build",
      body: "Work through Build, Connect, Capture, Respond, Nurture, and Close. Configure your workspace around the people and opportunities you already work with.",
    },
    {
      title: "One workspace for the core work",
      body: "Keep contacts, deals, tasks, calendar, lead forms, and booking pages together. Organize buyer inquiries and seller opportunities without starting from a blank general-purpose CRM.",
    },
    {
      title: "Availability stated before you buy",
      body: "AI, messaging, and automation channels remain Private Preview where labeled. The Solo offer does not promise every channel is live or included without additional confirmation.",
    },
  ],
  featureTable: {
    heading: "Compare the workflow you need",
    rows: [
      {
        label: "Product focus",
        agentstack: "Realtors: buyers, sellers, showings, and offers",
        competitor: "Broad CRM and marketing platform",
      },
      {
        label: "Contacts and deal pipelines",
        agentstack: true,
        competitor: true,
      },
      {
        label: "Lead forms and booking calendars",
        agentstack: true,
        competitor: true,
      },
      {
        label: "Setup approach",
        agentstack: "Guided six-step real estate setup",
        competitor: "Configurable workflows and industry snapshots",
      },
      {
        label: "AI, messaging, and automations",
        agentstack: "Private Preview where labeled; confirm availability first",
        competitor: "Plan, add-on, and usage charges apply",
      },
      {
        label: "Entry monthly offer",
        agentstack: "$99/month Solo — one workspace",
        competitor: "$97/month Starter; $297/month Unlimited",
      },
    ],
  },
  pricing: {
    heading: "Compare the current monthly offers",
    agentstack: {
      headline: SOLO_PRICE_LINE,
      detail:
        "One workspace and the core lead-to-appointment workflow, with a guided six-step setup.",
      notes: [
        SOLO_MONTHLY_TERMS,
        "Includes people, deals, tasks, calendar, lead forms, and booking pages.",
        "Private Preview channels and optional add-ons are confirmed before activation.",
        SOLO_CANCELLATION,
      ],
    },
    competitor: {
      headline: "GoHighLevel: Starter $97/month; Unlimited $297/month",
      detail:
        "GoHighLevel offers a broad CRM and marketing platform. Its Starter and Unlimited tiers serve different account needs; compare the tier and usage charges you would actually use.",
      notes: [
        "Starter includes three sub-accounts; Unlimited includes unlimited sub-accounts.",
        "Telecommunications, AI usage, and optional add-ons can carry additional charges.",
        "Check GoHighLevel’s current pricing directly before purchasing.",
      ],
    },
    summary:
      "Choose based on the workflow and scope you need. AgentStack Solo is $99/month for one realtor-focused workspace. Compare the included tools, current availability, and any optional usage costs before switching.",
  },
  verification: {
    heading: "Check the offer before switching",
    intro: "Compare the published plans and the capabilities available today.",
    items: [
      {
        label: "Monthly plan",
        agentstack: SOLO_PRICE_LINE,
        competitor: "Starter $97/month; Unlimited $297/month",
        sources: [
          { label: "AgentStack pricing", url: "/pricing" },
          {
            label: "GoHighLevel pricing",
            url: "https://www.gohighlevel.com/pricing",
          },
        ],
      },
      {
        label: "Workflow and availability",
        agentstack:
          "Guided real estate setup; advanced channels labeled Private Preview",
        competitor:
          "CRM, pipelines, workflows, and booking calendars; check plan and usage terms",
        sources: [
          { label: "The AgentStack Method", url: "/the-method" },
          {
            label: "GoHighLevel features and fees",
            url: "https://www.gohighlevel.com/pricing",
          },
        ],
      },
    ],
  },
  competitorWins: {
    heading: "When GoHighLevel may be the better fit",
    bullets: [
      "You run a marketing agency serving several industries and want a broad platform to configure for them.",
      "Your decision depends on capabilities AgentStack currently labels Private Preview.",
    ],
    closing:
      "Check the specific plan and channel availability on both platforms. AgentStack CRM is focused on the day-to-day work of realtors.",
  },
  faq: {
    heading: "Questions from agents considering a switch",
    items: [
      {
        question: "How much is AgentStack Solo?",
        answer: `${SOLO_PRICE_LINE}. ${SOLO_MONTHLY_TERMS}`,
      },
      {
        question: "Is AgentStack CRM built for real estate?",
        answer:
          "Yes. It is the operating system for realtors, bringing buyer and seller leads, listing appointments, showings, offers, and deals into one workspace.",
      },
      {
        question: "Does Solo include every AI and automation channel?",
        answer:
          "No. Capabilities labeled Private Preview require confirmation of availability and billing before activation. Review the current pricing page for what is Live.",
      },
      {
        question: "Do I have to build my CRM from scratch?",
        answer:
          "The six-step guided setup helps you configure the workspace around your real estate business. Follow Build, Connect, Capture, Respond, Nurture, and Close.",
      },
      {
        question: "What does the Solo subscription cover?",
        answer:
          "AgentStack Solo is a $99/month subscription for one workspace, guided setup, people, deals, tasks, calendar, lead forms, and booking pages. Review the pricing page for availability and optional add-ons.",
      },
      {
        question: "How do I cancel?",
        answer: `${SOLO_CANCELLATION} Cancel before renewal through your billing portal; see the cancellation guide for account and retention details.`,
      },
    ],
  },
  finalCta: {
    headline: "A clearer home for your real estate business.",
    body: `Keep your next lead, appointment, and deal moving in a workspace built for realtors. ${SOLO_PRICE_LINE}.`,
    primaryCtaLabel: "See AgentStack Solo — $99/month",
    primaryCtaHref: "/pricing",
  },
};
