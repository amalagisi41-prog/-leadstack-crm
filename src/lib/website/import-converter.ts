import "server-only";

import type { WebsiteConfig } from "@/types/website";

/**
 * Converts a scraped existing website into a WebsiteConfig the operator can
 * review and build from.
 *
 * DESIGN RULE — never invent a value the operator has to live with.
 *
 * An earlier version filled anything it could not extract with realistic
 * placeholders: `contact@example.com`, `https://example.com/contact`, and
 * generic marketing filler. The operator's next click after an import is
 * "Build site", so those placeholders could reach a published customer
 * website — a live page with a fake contact address on it.
 *
 * Unresolved fields are now left EMPTY. `validateWebsiteConfig()` already
 * treats empty `heading` / `hero_statement` / `features` / `benefits` /
 * `contact_details` / `cta_link` as errors, so an incomplete import is
 * blocked from building by the existing validation path and the builder form
 * shows the operator exactly which fields still need them. That matches the
 * product standard in CLAUDE.md: say what is missing by name, and never mark
 * work complete that the user did not do.
 *
 * Length caps below are the ones `validateWebsiteConfig()` enforces, not
 * gitpage's raw maximums. Emitting a 500-character hero statement that then
 * fails our own validation is not a kindness.
 */

/** Matches validateWebsiteConfig: heading + hero_statement max 80. */
const MAX_HEADING = 80;
const MAX_HERO = 80;
/** Matches validateWebsiteConfig: features + benefits max 60. */
const MAX_LIST_FIELD = 60;

export interface ImportedWebsiteData {
  title?: string;
  description?: string;
  features?: string;
  businessName?: string;
  contactEmail?: string;
  heroStatement?: string;
  benefits?: string;
}

/** Trims to a length cap on a word boundary where possible. */
function clamp(value: string, max: number): string {
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Joins list items under a hard character cap, dropping items that do not
 * fit rather than truncating mid-word. Returns "" when nothing fits.
 */
function joinWithinCap(items: string[], max: number): string {
  const out: string[] = [];
  for (const item of items) {
    const candidate = [...out, item].join(", ");
    if (candidate.length > max) break;
    out.push(item);
  }
  return out.join(", ");
}

/**
 * Addresses we should never present to an operator as their business contact.
 * A scraped page routinely carries a platform or vendor address in the footer
 * (Wix, Squarespace, a web designer's mailto) long before it carries the
 * actual business inbox.
 */
const NON_BUSINESS_EMAIL_PATTERNS = [
  /@(?:example|test|localhost)\./i,
  /@(?:sentry|wix|squarespace|godaddy|shopify|wordpress|weebly)\./i,
  /^(?:no-?reply|do-?not-?reply|postmaster|webmaster|abuse|privacy)@/i,
  /\.(?:png|jpe?g|gif|svg|webp)$/i,
];

function isPlausibleBusinessEmail(email: string): boolean {
  return !NON_BUSINESS_EMAIL_PATTERNS.some((re) => re.test(email));
}

/**
 * Extract key data from scraped markdown.
 * Firecrawl returns onlyMainContent markdown, so we parse headings,
 * paragraphs, and lists.
 */
export function extractFromMarkdown(markdown: string): ImportedWebsiteData {
  const lines = markdown.split("\n");
  const data: ImportedWebsiteData = {};

  let section: "features" | "benefits" | null = null;
  const featureLines: string[] = [];
  const benefitLines: string[] = [];
  const candidateEmails: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // H1 → title / hero statement
    if (trimmed.startsWith("# ")) {
      if (!data.title) data.title = trimmed.replace(/^#\s+/, "").trim();
      if (!data.heroStatement) data.heroStatement = data.title;
      continue;
    }

    // H2 → section marker. Any H2 that is not a features/benefits heading
    // ends the current section, so a list under "Contact us" is not
    // collected as features.
    if (trimmed.startsWith("## ")) {
      const heading = trimmed.replace(/^##\s+/, "").toLowerCase();
      if (
        heading.includes("feature") ||
        heading.includes("service") ||
        heading.includes("what we")
      ) {
        section = "features";
      } else if (
        heading.includes("benefit") ||
        heading.includes("why") ||
        heading.includes("advantage")
      ) {
        section = "benefits";
      } else {
        section = null;
      }
      continue;
    }

    // List items belong to whichever section is open.
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const item = trimmed.replace(/^[-*]\s+/, "").trim();
      if (item && section === "features") featureLines.push(item);
      else if (item && section === "benefits") benefitLines.push(item);
      continue;
    }

    // First substantial paragraph → description.
    if (trimmed.length > 20 && !trimmed.startsWith("#") && !data.description) {
      data.description = trimmed;
    }

    // Collect every email, choose the best one after the pass. Taking the
    // first match tended to pick up a webmaster or platform address.
    const emailMatch = trimmed.match(
      /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g,
    );
    if (emailMatch) candidateEmails.push(...emailMatch);
  }

  const bestEmail = candidateEmails.find(isPlausibleBusinessEmail);
  if (bestEmail) data.contactEmail = bestEmail;

  if (featureLines.length > 0) {
    data.features = joinWithinCap(featureLines, MAX_LIST_FIELD);
  }
  if (benefitLines.length > 0) {
    data.benefits = joinWithinCap(benefitLines, MAX_LIST_FIELD);
  }

  return data;
}

/**
 * Normalizes an operator-typed domain into an https URL.
 * Throws when the input is not a plausible public web address.
 */
export function normalizeImportUrl(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new Error("Enter a website address.");

  // Reject a non-web scheme explicitly rather than letting `https://` get
  // prefixed onto it and failing later with a confusing hostname error.
  const schemeMatch = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (schemeMatch && !/^https?$/i.test(schemeMatch[1])) {
    throw new Error("Only http:// and https:// addresses can be imported.");
  }

  const withScheme = schemeMatch ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`"${input}" is not a valid website address.`);
  }

  // Must look like a public hostname. Blocks localhost, bare hostnames with
  // no dot, and the cloud metadata endpoints that make a fetch-by-URL
  // feature an SSRF vector. Firecrawl does the actual fetching, but there is
  // no reason to forward these.
  const host = url.hostname.toLowerCase();
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    isIpLiteral ||
    !host.includes(".")
  ) {
    throw new Error(
      "Enter a public website address, for example yourbusiness.com.",
    );
  }

  return url;
}

/**
 * Convert extracted website data into a WebsiteConfig.
 *
 * `siteUrl` is the address the operator actually typed — it is used for the
 * CTA link so the imported site points back at the real business rather than
 * a placeholder. (This parameter was previously accepted and never read,
 * which is why every imported site got `https://example.com/contact`.)
 */
export function convertToWebsiteConfig(
  importedData: ImportedWebsiteData,
  siteUrl?: URL,
): WebsiteConfig {
  const businessName = importedData.businessName || importedData.title || "";
  const heroSource = importedData.heroStatement || importedData.description || "";

  return {
    site_type: "LocalSite",
    build_type: "local",
    niche: null,
    language: "en",
    heading: clamp(importedData.title || "", MAX_HEADING),
    color_scheme: "Standard",
    hero_statement: clamp(heroSource, MAX_HERO),
    // Left empty when nothing was extracted — the operator fills these in,
    // and validateWebsiteConfig() blocks the build until they do.
    features: importedData.features ?? "",
    benefits: importedData.benefits ?? "",
    contact_details: importedData.contactEmail ?? "",
    cta_link: siteUrl ? siteUrl.origin : "",
    include_faq: true,
    video_link: "",
    local_page_selections: {
      index: true,
      services: true,
      contact: true,
      privacy: true,
      terms: true,
    },
    services_config: {
      let_ai_do_services: false,
      services_list: importedData.features ?? "",
    },
    business_details: {
      business_name: businessName,
      business_street: "",
      business_city: "",
      business_state: "",
      // Not inferable from a scrape. Defaulting to "United States" silently
      // put a country on the operator's contact page that they never chose.
      business_country: "",
      business_zip: "",
      business_phone: "",
      business_email: importedData.contactEmail ?? "",
      google_rating: "",
      google_review_count: "",
      opening_hours: "",
    },
    design_color_palette: "Default",
    custom_colors: "",
    design_typography: "Default",
    design_layout: "Default",
    design_components: "Default",
    design_interactions: "Default",
    design_buttons: "Default",
    design_contact_form: "Default",
    design_icons: "Default",
    astra_theme: false,
  };
}

/**
 * Main entry point: scrape a domain and convert to WebsiteConfig.
 */
export async function importWebsiteFromDomain(
  domainUrl: string,
  scrapeFunction: (
    url: string,
  ) => Promise<{ markdown: string; title?: string | null }>,
): Promise<WebsiteConfig> {
  const url = normalizeImportUrl(domainUrl);

  const scraped = await scrapeFunction(url.toString());

  const extracted = extractFromMarkdown(scraped.markdown);
  if (scraped.title) {
    extracted.title = scraped.title;
  }

  return convertToWebsiteConfig(extracted, url);
}
