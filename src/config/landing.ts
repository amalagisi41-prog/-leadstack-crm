/**
 * Landing-page configuration.
 *
 * The repo ships with two complete landing pages:
 *
 *   - "custom"    â€” a generic agency-CRM landing the buyer brands as
 *     their own. THIS IS THE DEFAULT â€” every new clone should be
 *     branded for the buyer's business, so the custom variant renders
 *     at "/" out of the box and CUSTOM_BRAND below should be edited
 *     first.
 *
 *     Wired for a DONE-FOR-YOU sales motion, not self-serve SaaS:
 *     prospects see a "Talk to us" mailto CTA (uses CUSTOM_BRAND.
 *     supportEmail), the owner takes payment off-system, provisions
 *     a sub-account, then invites the client via the in-app invite
 *     flow. Pricing tiers + section are hidden by default â€” see the
 *     CUSTOM_BRAND.pricing block below for how to re-enable real
 *     self-serve resale.
 *
 *   - "leadstack" â€” the LeadStack-branded marketing landing that sells
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
 * render time. Resolved on the server by lib/landing/resolve-brand.ts â€”
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
 * landing for your own business â€” the values below are placeholder
 * defaults so the page renders cleanly out of the box.
 */
export const CUSTOM_BRAND: CustomBrand = {
  /** Displayed in navbar, hero, footer copyright, page title â€” everywhere. */
  name: "YourCRM",

  /** One-line positioning, surfaced in hero subtitle + meta description. */
  tagline: "All-in-one CRM for modern teams",

  /**
   * Short (~140 char) description used under the hero headline. Should
   * read like a tweet â€” what the product does, for whom.
   */
  shortDescription:
    "Contacts, pipeline, automations, and a website builder â€” all in one branded workspace your team actually wants to use.",

  /** Used on CTA buttons + the FAQ "talk to us" line + footer. */
  supportEmail: "hello@yourbrand.com",

  /** Used in footer, og:url, canonical. No https://, no trailing slash. */
  primaryDomain: "yourbrand.com",

  /**
   * Pricing tiers. HIDDEN BY DEFAULT â€” the custom landing is wired for
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
   *      checkout.completed â€” today's /api/auth/signup is invite-only
   *      after the first bootstrap user, so strangers paying through
   *      Stripe can't currently land anywhere. See CLAUDE.md
   *      ("Auth & Tenancy Model") for the existing signup contract.
   */
  pricing: {
    starter: {
      name: "Starter",
      priceMonthly: 0,
      priceAnnual: 0,
      blurb: "For solo operators kicking the tyres.",
      features: [
        "Up to 100 contacts",
        "1 sub-account",
        "Pipeline + tasks + calendar",
        "Forms with public hosted page",
        "Community support",
      ],
      cta: "Get started free",
      highlighted: false,
    },
    pro: {
      name: "Pro",
      priceMonthly: 97,
      priceAnnual: 77,
      blurb: "For growing teams with serious volume.",
      features: [
        "Unlimited contacts",
        "Unlimited sub-accounts",
        "Pipeline + Kanban + automations",
        "Email + SMS shared sender",
        "Built-in website builder",
        "Up to 5 team seats",
        "Priority email support",
      ],
      cta: "Start 14-day trial",
      highlighted: true,
    },
    scale: {
      name: "Scale",
      priceMonthly: 297,
      priceAnnual: 237,
      blurb: "For teams running multi-account workspaces.",
      features: [
        "Everything in Pro",
        "Unlimited team seats",
        "Advanced automations",
        "Audit logs + SSO",
        "Dedicated onboarding",
        "SLA-backed support",
      ],
      cta: "Talk to sales",
      highlighted: false,
    },
  },
};
