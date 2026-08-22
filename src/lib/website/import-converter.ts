import "server-only";

import type { WebsiteConfig } from "@/types/website";

/**
 * Converts scraped HTML/markdown from an existing website into a WebsiteConfig
 * suitable for the Vibe Builder. This is a best-effort conversion that extracts
 * key sections (title, description, features) from the scraped content.
 *
 * The converter handles both HTML (from Firecrawl scrape) and markdown formats,
 * extracting meaningful content and mapping it to WebsiteConfig fields.
 */

interface ImportedWebsiteData {
  title?: string;
  description?: string;
  features?: string;
  businessName?: string;
  contactEmail?: string;
  heroStatement?: string;
  benefits?: string;
}

/**
 * Extract key data from scraped markdown/HTML content.
 * Firecrawl returns onlyMainContent markdown, so we parse that to find
 * headings, paragraphs, and lists.
 */
function extractFromMarkdown(markdown: string): ImportedWebsiteData {
  const lines = markdown.split("\n");
  const data: ImportedWebsiteData = {};

  let inFeatures = false;
  let inBenefits = false;
  const featureLines: string[] = [];
  const benefitLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Extract H1 as title/hero statement
    if (trimmed.startsWith("# ")) {
      if (!data.title) data.title = trimmed.replace(/^#\s+/, "").trim();
      if (!data.heroStatement) data.heroStatement = data.title;
      continue;
    }

    // Extract H2 as section markers
    if (trimmed.startsWith("## ")) {
      const heading = trimmed.replace(/^##\s+/, "").toLowerCase();
      inFeatures =
        heading.includes("feature") || heading.includes("service") || heading.includes("what");
      inBenefits =
        heading.includes("benefit") || heading.includes("why") || heading.includes("advantage");
      if (!inFeatures && !inBenefits) {
        inFeatures = false;
        inBenefits = false;
      }
      continue;
    }

    // Collect feature/benefit lines
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const item = trimmed.replace(/^[-*]\s+/, "").trim();
      if (item && inFeatures) {
        featureLines.push(item);
      } else if (item && inBenefits) {
        benefitLines.push(item);
      }
      continue;
    }

    // Regular paragraphs — use as description if available
    if (trimmed.length > 20 && !trimmed.startsWith("#") && !data.description) {
      data.description = trimmed;
    }

    // Extract email if present
    if (!data.contactEmail) {
      const emailMatch = trimmed.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
      if (emailMatch) {
        data.contactEmail = emailMatch[1];
      }
    }
  }

  // Consolidate features/benefits
  if (featureLines.length > 0) {
    data.features = featureLines.slice(0, 5).join(", ");
  }
  if (benefitLines.length > 0) {
    data.benefits = benefitLines.slice(0, 3).join(", ");
  }

  return data;
}

/**
 * Convert extracted website data into a WebsiteConfig for gitpage.
 * Uses sensible defaults for unspecified fields.
 */
export function convertToWebsiteConfig(
  importedData: ImportedWebsiteData,
  userDomain?: string
): WebsiteConfig {
  // Extract domain or business name
  const businessName = importedData.businessName || importedData.title || "My Business";

  return {
    site_type: "LocalSite",
    build_type: "local",
    niche: null,
    language: "en",
    heading: (importedData.title || "Your Business").substring(0, 80),
    color_scheme: "Standard",
    hero_statement: (
      importedData.heroStatement ||
      importedData.description ||
      "Welcome to our website"
    ).substring(0, 500),
    features:
      importedData.features ||
      "Professional services • High quality • Customer focused",
    benefits:
      importedData.benefits || "Save time • Improve efficiency • Get results",
    contact_details: importedData.contactEmail || "contact@example.com",
    cta_link: "https://example.com/contact",
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
      services_list:
        importedData.features ||
        "Professional Services\nQuality Service\nCustomer Support",
    },
    business_details: {
      business_name: businessName,
      business_street: "",
      business_city: "",
      business_state: "",
      business_country: "United States",
      business_zip: "",
      business_phone: "",
      business_email: importedData.contactEmail || "",
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
 * Returns the config ready to be saved to a website doc.
 */
export async function importWebsiteFromDomain(
  domainUrl: string,
  scrapeFunction: (url: string) => Promise<{ markdown: string; title?: string | null }>,
): Promise<WebsiteConfig> {
  // Normalize URL
  let urlToScrape = domainUrl;
  if (!urlToScrape.startsWith("http")) {
    urlToScrape = `https://${urlToScrape}`;
  }

  // Scrape the domain
  const scraped = await scrapeFunction(urlToScrape);

  // Extract data from markdown
  const extracted = extractFromMarkdown(scraped.markdown);
  if (scraped.title) {
    extracted.title = scraped.title;
  }

  // Convert to WebsiteConfig
  return convertToWebsiteConfig(extracted, domainUrl);
}
