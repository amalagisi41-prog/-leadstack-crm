/**
 * Public-page competitor comparison data shape. Each /leadstack-vs-{slug}
 * page is rendered from one of these objects so the route, components,
 * and JSON-LD schema all consume a single typed source.
 *
 * Add a new competitor by:
 *   1. Creating src/data/comparisons/{slug}.ts that exports a Comparison.
 *   2. Adding it to src/data/comparisons/index.ts.
 *   3. Adding a footer link in src/components/landing/footer.tsx.
 * The route + sitemap pick it up automatically via generateStaticParams.
 */
export type Comparison = {
  /** URL slug — becomes /leadstack-vs-{slug}. Lowercase, hyphenated. */
  slug: string;
  /** Display name of the competitor (e.g. "GoHighLevel", "HubSpot"). */
  competitorName: string;
  /** Optional short-form name for tight contexts (table headers, etc.). */
  competitorShortName?: string;
  /** Per-page meta title — Google's SERP headline. <=60 chars ideal. */
  metaTitle: string;
  /** Per-page meta description. ~155 chars ideal. */
  metaDescription: string;
  /** Last factually verified — surfaces in the legal disclaimer. */
  lastVerifiedDate: string;
  /** Hero block. */
  hero: {
    h1: string;
    subhead: string;
    ctaLabel: string;
  };
  /** Pull-quote framed as a customer/operator switching from competitor. */
  pullQuote: {
    text: string;
    author: string;
    role?: string;
  };
  /** 3-bullet "the problem with X" framing block. */
  painPoints: {
    heading: string;
    bullets: Array<{
      title: string;
      body: string;
    }>;
  };
  /** 4-block advantage grid — what LeadStack does differently. */
  advantages: Array<{
    title: string;
    body: string;
  }>;
  /** Feature-by-feature comparison table. */
  featureTable: {
    heading: string;
    rows: Array<{
      label: string;
      /** true = check, false = X, string = note (e.g. "Add-on $X/mo"). */
      leadstack: boolean | string;
      competitor: boolean | string;
    }>;
  };
  /** Pricing comparison block — the part GHL skips. */
  pricing: {
    heading: string;
    leadstack: {
      headline: string;
      detail: string;
      notes: string[];
    };
    competitor: {
      headline: string;
      detail: string;
      notes: string[];
    };
    summary: string;
  };
  /** Honest "where the competitor wins" section. Builds trust. Optional —
   *  omit to hide the section entirely. */
  competitorWins?: {
    heading: string;
    bullets: string[];
    closing: string;
  };
  /** FAQ section — fuel for FAQPage JSON-LD schema. */
  faq: {
    heading: string;
    items: Array<{
      question: string;
      answer: string;
    }>;
  };
  /** Final CTA copy. */
  finalCta: {
    headline: string;
    body: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
  };
};
