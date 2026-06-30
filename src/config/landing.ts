/**
 * Landing-page configuration.
 *
 * The repo ships with two complete landing pages:
 *
 *   - "custom"    â€" a generic agency-CRM landing the buyer brands as
 *     their own. THIS IS THE DEFAULT â€" every new clone should be
 *     branded for the buyer's business, so the custom variant renders
 *     at "/" out of the box and CUSTOM_BRAND below should be edited
 *     first.
 *
 *     Wired for a DONE-FOR-YOU sales motion, not self-serve SaaS:
 *     prospects see a "Talk to us" mailto CTA (uses CUSTOM_BRAND.
 *     supportEmail), the owner takes payment off-system, provisions
 *     a sub-account, then invites the client via the in-app invite
 *     flow. Pricing tiers + section are hidden by default â€" see the
 *     CUSTOM_BRAND.pricing block below for how to re-enable real
 *     self-serve resale.
 *
 *   - "leadstack" â€" the LeadStack-branded marketing landing that sells
 *     LeadStack itself (used on the leadstack.dev demo site). Only flip
 *     back to this if you're running the public LeadStack demo.
 *
 * Flip LANDING_VARIANT below to swap which one renders at "/".
 */

export type LandingVariant = "leadstack" | "custom";

export const LANDING_VARIANT: LandingVariant = "custom";

export interface CustomPricingTier {
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  blurb: string;
  features: readonly string[];
  cta: string;
  highlighted: boolean;
}

export interface CustomBrand {
  name: string;
  tagline: string;
  shortDescription: string;
  supportEmail: string;
  primaryDomain: string;
  pricing: {
    starter: CustomPricingTier;
    pro: CustomPricingTier;
    scale: CustomPricingTier;
  };
}

/**
 * The brand object actually passed to the custom landing components at
 * render time. Resolved on the server by lib/landing/resolve-brand.ts â€"
 * agency doc fields take precedence, CUSTOM_BRAND fills the gaps. `logoUrl`
 * is nullable because "no logo set" is a meaningful state (renders the
 * default gradient mark instead of an <img>).
 */
export interface ResolvedBrand {
  name: string;
  logoUrl: string | null;
  tagline: string;
  shortDescription: string;
  supportEmail: string;
  primaryDomain: string;
}

/**
 * Brand fields used by the "custom" landing variant. Ignored entirely when
 * LANDING_VARIANT is "leadstack". Edit these to brand the white-label
 * landing for your own business â€" the values below are placeholder
 * defaults so the page renders cleanly out of the box.
 */
export const CUSTOM_BRAND: CustomBrand = {
  /** Displayed in navbar, hero, footer copyright, page title â€" everywhere. */
  name: "AgentEdge",

  /** One-line positioning, surfaced in hero subtitle + meta description. */
  tagline: "Built for the top 1% of realtors",

  /**
   * Short (~140 char) description used under the hero headline. Should
   * read like a tweet â€" what the product does, for whom.
   */
  shortDescription:
    "Contacts, pipeline, AI follow-up, and client communication — the CRM high-producing agents actually use. Close more, work less.",

  /** Used on CTA buttons + the FAQ "talk to us" line + footer. */
  supportEmail: "hello@agentedge.com",

  /** Used in footer, og:url, canonical. No https://, no trailing slash. */
  primaryDomain: "agentedge.com",

  /**
   * Pricing tiers. HIDDEN BY DEFAULT â€" the custom landing is wired for
   * done-for-you sales (see header comment), not self-serve, so the
   * Pricing section and the #pricing nav link are not rendered. The
   * config below is kept as a starting point for buyers who later want
   * to enable real Stripe-driven SaaS resale. To re-enable:
   *
   *   1. In src/app/page.tsx, re-import and render <CustomPricing />
   *      (file at src/components/landing-custom/pricing.tsx).
   *   2. Re-add the "#pricing" nav link in landing-custom/navbar.tsx
   *      (desktop nav + mobile sheet).
   *   3. Wire the pricing card buttons to createCheckoutSession with
   *      the relevant STRIPE_PRO_PRICE_ID etc., instead of /signup.
   *   4. Un-gate the Subscription panel in the sub-account settings
   *      page (currently gated on LANDING_VARIANT === "leadstack").
   *   5. Add a Stripe-driven public signup flow that provisions a
   *      fresh agency + sub-account + owner membership on
   *      checkout.completed â€" today's /api/auth/signup is invite-only
   *      after the first bootstrap user, so strangers paying through
   *      Stripe can't currently land anywhere. See CLAUDE.md
   *      ("Auth & Tenancy Model") for the existing signup contract.
   */
  pricing: {
    starter: {
      name: "Solo Agent",
      priceMonthly: 79,
      priceAnnual: 59,
      blurb: "For individual agents who are serious about follow-up.",
      features: [
        "Up to 2,500 contacts",
        "Pipeline + tasks + calendar",
        "AI text & email follow-up",
        "Lead capture forms",
        "Booking pages",
        "Mobile-friendly dashboard",
      ],
      cta: "Start free trial",
      highlighted: false,
    },
    pro: {
      name: "Top Producer",
      priceMonthly: 149,
      priceAnnual: 119,
      blurb: "For high-volume agents who can't afford to let a lead go cold.",
      features: [
        "Unlimited contacts",
        "AI Voice + SMS + Web Chat agent",
        "Automated drip sequences",
        "Quote & estimate builder",
        "Built-in website for listings",
        "Up to 5 team members",
        "Priority support",
      ],
      cta: "Start free trial",
      highlighted: true,
    },
    scale: {
      name: "Team & Brokerage",
      priceMonthly: 349,
      priceAnnual: 279,
      blurb: "For teams and brokerages managing multiple agents.",
      features: [
        "Everything in Top Producer",
        "Unlimited team seats",
        "Per-agent sub-accounts",
        "Territory assignment & routing",
        "Bulk email campaigns",
        "Dedicated onboarding call",
        "SLA-backed support",
      ],
      cta: "Talk to us",
      highlighted: false,
    },
  },
};
