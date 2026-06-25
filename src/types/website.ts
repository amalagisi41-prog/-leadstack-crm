import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Mirrors the gitpage.site typeform inputs verbatim. Field names match
 * gitpage's source-of-truth so the payload we send maps 1:1 to what their
 * generator expects.
 *
 * Internal fields:
 *   - site_type: legacy. Kept on the doc as "LocalSite" for back-compat;
 *     `build_type` is the actual discriminator now.
 *   - astra_theme: server-managed, hard-coded false. Not exposed to the UI.
 *
 * build_type maps directly to gitpage's `buildType` parameter:
 *   - "local" → multi-page LocalSite (home + optional services/contact/terms)
 *   - "vsl"   → single-page Video Sales Letter funnel
 */

export type WebsiteStatus =
  | "draft"
  | "queued"
  | "building"
  | "ready"
  | "failed";

export type BuildType = "local" | "vsl";

export type ColorScheme = "Standard" | "Dark Mode";

/**
 * Niche templates ship a research-backed design system, section structure,
 * imagery, and copy tone for a specific vertical. Optional — omit for a
 * generic build. Both local and vsl support the same set of niche keys.
 *
 * When set on a `local` build, gitpage forces pages to
 *   [index, services, contact, privacy, terms]
 * and rejects blog pages.
 *
 * When set on a `vsl` build, gitpage auto-ships privacy + terms.
 */
export type Niche = "home_services" | "real_estate" | "gym_fitness";

export interface WebsiteServicesConfig {
  let_ai_do_services: boolean;
  /** Only used when let_ai_do_services === false. */
  services_list: string;
}

export interface WebsiteBusinessDetails {
  business_name: string;
  business_street: string;
  business_city: string;
  business_state: string;
  business_country: string;
  business_zip: string;
  business_phone: string;
  business_email: string;
  google_rating: string;
  google_review_count: string;
  opening_hours: string;
}

export interface WebsitePageSelections {
  /** Always true; index.html is required by gitpage. UI locks this on. */
  index: true;
  services: boolean;
  contact: boolean;
  /** Newly allowed by gitpage v1; required when niche is set. */
  privacy: boolean;
  terms: boolean;
}

export interface WebsiteConfig {
  // Always required
  site_type: "LocalSite";
  /**
   * Discriminator between gitpage's two supported builders. Existing docs
   * predating VSL won't carry this — readers default to "local".
   */
  build_type: BuildType;
  /**
   * Optional niche template key. When set, gitpage swaps in a research-backed
   * design system + section structure + copy tone for that vertical. Both
   * local and vsl support niche; omit (null) for a generic build. Existing
   * docs predating the niche feature won't carry this — readers default to
   * null.
   */
  niche: Niche | null;
  language: string;
  /** Max 80 chars enforced client-side; server re-validates. */
  heading: string;
  color_scheme: ColorScheme;
  hero_statement: string;
  features: string;
  benefits: string;
  /** Email address. */
  contact_details: string;
  /** http(s) URL. */
  cta_link: string;
  include_faq: boolean;

  /** Required when build_type === "vsl"; ignored otherwise. http(s) URL. */
  video_link: string;

  local_page_selections: WebsitePageSelections;

  /** Populated only when build_type === "local" + services.html selected. */
  services_config: WebsiteServicesConfig | null;
  /** Populated only when build_type === "local" + contact.html selected. */
  business_details: WebsiteBusinessDetails | null;

  // Design — picked from gitpage's canonical value lists. Validation rejects
  // anything not in those lists. See lib/website/gitpage-values.ts.
  design_color_palette: string;
  /** Required when design_color_palette === "Custom" — hex triple, e.g. "#5B4BFF,#EEF0FF,#00E5A8". */
  custom_colors: string;
  design_typography: string;
  design_layout: string;
  design_components: string;
  design_interactions: string;
  design_buttons: string;
  design_contact_form: string;
  design_icons: string;

  /** System flag — hard-coded false in v1. Hidden from UI. */
  astra_theme: false;
}

/**
 * Subcollection doc at `subAccounts/{subAccountId}/website/{siteId}`. A
 * sub-account can hold up to `MAX_WEBSITES_PER_SUBACCOUNT` of these (see
 * `lib/website/limits.ts`). The legacy singleton lives at `.../website/main`
 * and remains valid as one of the slots — no migration needed.
 */
export interface WebsiteDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  /**
   * Operator-facing label for the site card. Defaulted to `Website N` at
   * creation. Legacy `main` docs predate this field — readers fall back to
   * the config heading, then "Untitled site".
   */
  name?: string;
  status: WebsiteStatus;
  /** Provider job id — null until a build is submitted. */
  gitpageJobId: string | null;
  /** Live URL once status === "ready". */
  liveUrl: string | null;
  /** Populated when status === "failed". */
  errorMessage: string | null;
  /**
   * Per-page generation warnings from gitpage on a successful build (e.g.
   * blog page failed but home + services succeeded). Shown alongside the
   * live URL. Null when there were none or the build hasn't finished.
   */
  partialErrors: string[] | null;
  /** Number of times we've polled gitpage for the current job — used to cap. */
  pollAttempts: number;
  lastBuildAt: Timestamp | FieldValue | null;
  lastBuildByUid: string | null;
  config: WebsiteConfig;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/**
 * Empty starter values used when the UI mounts on a sub-account that has
 * never built a site. Mirrors the WebsiteConfig shape so the form has
 * something to render against and the user only fills in non-blank fields.
 */
export function blankWebsiteConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "local",
    niche: null,
    language: "English",
    heading: "",
    color_scheme: "Standard",
    hero_statement: "",
    features: "",
    benefits: "",
    contact_details: "",
    cta_link: "",
    include_faq: false,
    video_link: "",
    local_page_selections: {
      index: true,
      services: false,
      contact: false,
      privacy: false,
      terms: false,
    },
    services_config: null,
    business_details: null,
    // Defaults match gitpage's documented defaults so an untouched form
    // produces a reasonable site.
    design_color_palette: "Modern / Startup",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}

export function blankServicesConfig(): WebsiteServicesConfig {
  return { let_ai_do_services: true, services_list: "" };
}

export function blankBusinessDetails(): WebsiteBusinessDetails {
  return {
    business_name: "",
    business_street: "",
    business_city: "",
    business_state: "",
    business_country: "",
    business_zip: "",
    business_phone: "",
    business_email: "",
    google_rating: "",
    google_review_count: "",
    opening_hours: "",
  };
}

/**
 * Demo prefill — Starbucks Chadstone. Wired to the "Sample" button on the
 * form so a complete payload can be submitted in one click during demos.
 */
export function sampleWebsiteConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "local",
    niche: null,
    language: "English",
    heading: "Starbucks Coffee Chadstone",
    color_scheme: "Standard",
    hero_statement: "Best Coffee In Melbourne",
    features: "Premium Espresso, Cozy Ambiance, Local Favorite",
    benefits: "Exceptional Taste, Welcoming Vibe, Local Pride",
    contact_details: "admin@sbc.com",
    cta_link: "https://sbc.com",
    include_faq: true,
    video_link: "",
    local_page_selections: {
      index: true,
      services: true,
      contact: true,
      privacy: false,
      terms: true,
    },
    services_config: {
      let_ai_do_services: false,
      services_list:
        "Welcoming coffeehouse with handcrafted coffee, espresso & tea, plus breakfast, lunch & pastries.",
    },
    business_details: {
      business_name: "Starbucks Chadstone",
      business_street: "1341 Dandenong Road",
      business_city: "Chadstone",
      business_state: "Victoria",
      business_country: "Australia",
      business_zip: "3148",
      business_phone: "",
      business_email: "admin@sbc.com",
      google_rating: "3.8",
      google_review_count: "1393",
      opening_hours:
        "Monday: 6:00 AM – 9:00 PM\nTuesday: 6:00 AM – 9:00 PM\nWednesday: 6:00 AM – 9:00 PM\nThursday: 6:00 AM – 9:00 PM\nFriday: 6:00 AM – 9:00 PM\nSaturday: 7:00 AM – 9:00 PM\nSunday: 7:00 AM – 9:00 PM",
    },
    design_color_palette: "Modern / Startup",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}

/**
 * Blank starter for the VSL (Video Sales Letter) builder. Single-page funnel —
 * no pages array, no business / services blocks. video_link is required at
 * submit time.
 */
export function blankVslConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "vsl",
    niche: null,
    language: "English",
    heading: "",
    color_scheme: "Standard",
    hero_statement: "",
    features: "",
    benefits: "",
    contact_details: "",
    cta_link: "",
    include_faq: false,
    video_link: "",
    local_page_selections: {
      index: true,
      services: false,
      contact: false,
      privacy: false,
      terms: false,
    },
    services_config: null,
    business_details: null,
    design_color_palette: "Modern / Startup",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}

/**
 * Demo prefill for the VSL builder. Coaching/consulting offer matching the
 * canonical VSL audience (coaches, consultants, course creators). YouTube
 * embed is a public clip so demos work anywhere without auth issues.
 */
export function sampleVslConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "vsl",
    niche: null,
    language: "English",
    heading: "Scale Your Coaching Practice To $30k/Month",
    color_scheme: "Standard",
    hero_statement: "Without burning out, hiring a team, or paid ads.",
    features: "Lead System, Sales Script, Delivery Playbook",
    benefits: "Predictable Income, Premium Clients, Time Freedom",
    contact_details: "hello@scalecoach.com",
    cta_link: "https://cal.com/scalecoach/strategy-call",
    include_faq: true,
    video_link: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    local_page_selections: {
      index: true,
      services: false,
      contact: false,
      privacy: false,
      terms: false,
    },
    services_config: null,
    business_details: null,
    design_color_palette: "Bold / Creative",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}

// ---------------------------------------------------------------------------
// Niche sample prefills — one per (niche × build type) combination, six total.
// Mirror the example payloads in §2.5–2.7 and §3.4–3.6 of
// LEADSTACK_NICHE_TEMPLATES.md. Niche-locked page sets force services + contact
// + privacy + terms all true; business_details are required since contact is
// forced on. Design fields are still set on niche samples but gitpage's niche
// directive overrides them — they're left in place so the form renders cleanly
// if a user later flips niche back to null.

export function sampleHomeServicesLocalConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "local",
    niche: "home_services",
    language: "English",
    heading: "Acme Plumbing — Charlotte's Trusted Plumbers Since 1998",
    color_scheme: "Standard",
    hero_statement:
      "Licensed, insured, on-time guaranteed. Same-day service across Charlotte.",
    features: "Emergency Repair, Water Heater Install, Drain Cleaning",
    benefits:
      "24/7 live phone, Upfront flat-rate pricing, 100% satisfaction guarantee",
    contact_details: "office@acmeplumbing.example",
    cta_link: "https://acmeplumbing.example/book",
    include_faq: true,
    video_link: "",
    local_page_selections: {
      index: true,
      services: true,
      contact: true,
      privacy: true,
      terms: true,
    },
    services_config: { let_ai_do_services: true, services_list: "" },
    business_details: {
      business_name: "Acme Plumbing",
      business_street: "201 W Trade St",
      business_city: "Charlotte",
      business_state: "NC",
      business_country: "USA",
      business_zip: "28202",
      business_phone: "(704) 555-0142",
      business_email: "office@acmeplumbing.example",
      google_rating: "4.9",
      google_review_count: "1247",
      opening_hours: "24/7 Emergency Service",
    },
    design_color_palette: "Modern / Startup",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}

export function sampleHomeServicesVslConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "vsl",
    niche: "home_services",
    language: "English",
    heading: "Hey Charlotte — Tired of Cold Showers?",
    color_scheme: "Standard",
    hero_statement:
      "Same-day water heater repair and install with upfront pricing.",
    features:
      "Free 2nd opinion, $200 off any water heater, 0% APR for 12 months",
    benefits: "Licensed and insured, On-time guarantee, 4.9-star rated",
    contact_details: "office@acmeplumbing.example",
    cta_link: "tel:+17045550142",
    include_faq: true,
    video_link: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    local_page_selections: {
      index: true,
      services: false,
      contact: false,
      privacy: false,
      terms: false,
    },
    services_config: null,
    business_details: null,
    design_color_palette: "Modern / Startup",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}

export function sampleRealEstateLocalConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "local",
    niche: "real_estate",
    language: "English",
    heading: "Serena Stone",
    color_scheme: "Standard",
    hero_statement:
      "Upper East Side real estate, with the discretion and track record your move deserves.",
    features:
      "Buyer Representation, Seller Representation, Off-Market Access",
    benefits: "Top 1% Producer, $1.2B career sales, 99% sale-to-list",
    contact_details: "serena@stonere.example",
    cta_link: "https://stonere.example/connect",
    include_faq: true,
    video_link: "",
    local_page_selections: {
      index: true,
      services: true,
      contact: true,
      privacy: true,
      terms: true,
    },
    services_config: { let_ai_do_services: true, services_list: "" },
    business_details: {
      business_name: "Stone Real Estate",
      business_street: "1230 Madison Avenue",
      business_city: "New York",
      business_state: "NY",
      business_country: "USA",
      business_zip: "10128",
      business_phone: "(212) 555-0188",
      business_email: "serena@stonere.example",
      google_rating: "",
      google_review_count: "",
      opening_hours: "By appointment",
    },
    design_color_palette: "Modern / Startup",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}

export function sampleRealEstateVslConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "vsl",
    niche: "real_estate",
    language: "English",
    heading: "What Is Your UES Home Worth — Today?",
    color_scheme: "Dark Mode",
    hero_statement: "A complimentary, comp-driven valuation in 24 hours.",
    features: "Off-market access, $1.2B career sales, 99% sale-to-list",
    benefits: "Discreet, Considered, Evidence-led",
    contact_details: "serena@stonere.example",
    cta_link: "https://stonere.example/valuation",
    include_faq: true,
    video_link: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    local_page_selections: {
      index: true,
      services: false,
      contact: false,
      privacy: false,
      terms: false,
    },
    services_config: null,
    business_details: null,
    design_color_palette: "Modern / Startup",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}

export function sampleGymFitnessLocalConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "local",
    niche: "gym_fitness",
    language: "English",
    heading: "PEAK — Train Harder. Live Stronger.",
    color_scheme: "Dark Mode",
    hero_statement:
      "Coach-led sessions, small-group programming, in the heart of New York.",
    features: "HR tracking, Small-group coaching, Programmed cycles",
    benefits: "Adapt fast, Stay durable, Train sharper",
    contact_details: "admin@peak.com",
    cta_link: "https://peak.com",
    include_faq: true,
    video_link: "",
    local_page_selections: {
      index: true,
      services: true,
      contact: true,
      privacy: true,
      terms: true,
    },
    services_config: { let_ai_do_services: true, services_list: "" },
    business_details: {
      business_name: "PEAK",
      business_street: "4 Astor Place",
      business_city: "New York",
      business_state: "NY",
      business_country: "USA",
      business_zip: "10003",
      business_phone: "(917) 877-1400",
      business_email: "admin@peak.com",
      google_rating: "4.5",
      google_review_count: "966",
      opening_hours: "Mon-Thu 5:30am-10pm, Fri 5:30am-8pm, Sat-Sun 8am-8pm",
    },
    design_color_palette: "Modern / Startup",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}

export function sampleGymFitnessVslConfig(): WebsiteConfig {
  return {
    site_type: "LocalSite",
    build_type: "vsl",
    niche: "gym_fitness",
    language: "English",
    heading: "How NYC Professionals Train Like Athletes Without Quitting Their Day Jobs.",
    color_scheme: "Dark Mode",
    hero_statement:
      "Coach-led sessions, smart programming, and a community that walks in sharper every week.",
    features: "Coach-led, HR tracked, Progressive",
    benefits: "Adapt fast, Stay durable, Train sharper",
    contact_details: "admin@peak.com",
    cta_link: "https://peak.com",
    include_faq: true,
    video_link: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    local_page_selections: {
      index: true,
      services: false,
      contact: false,
      privacy: false,
      terms: false,
    },
    services_config: null,
    business_details: null,
    design_color_palette: "Modern / Startup",
    custom_colors: "",
    design_typography: "Professional / Corporate",
    design_layout: "Spacious",
    design_components: "Rounded & Soft",
    design_interactions: "Energetic",
    design_buttons: "Solid Primary",
    design_contact_form: "Centered Card",
    design_icons: "Heroicons Outline",
    astra_theme: false,
  };
}
