import type { Comparison } from "@/types/comparisons";

/**
 * Server-rendered JSON-LD for a competitor comparison page.
 *
 * Emits three structured-data blocks Google understands:
 *   - SoftwareApplication (LeadStack itself)
 *   - FAQPage (every FAQ Q+A — eligible for rich FAQ snippets in SERP)
 *   - BreadcrumbList (helps SERP show a Home › Compare › X path)
 *
 * Server-rendered into the static HTML response so Googlebot sees the
 * schema on first fetch — no hydration required. GoHighLevel ships zero
 * schema markup on their vs pages today; this is the cheapest single
 * SEO win in the build.
 */
export function ComparisonSchema({
  comparison,
  baseUrl,
}: {
  comparison: Comparison;
  baseUrl: string;
}) {
  const url = `${baseUrl}/leadstack-vs-${comparison.slug}`;

  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "LeadStack",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "LeadStack is an all-in-one agency CRM you self-host and brand as your own. Contacts, pipeline, calendar, booking pages, quotes, automations, bulk email, public REST API, and AI agents (Web Chat, SMS, Voice) in one codebase you own outright.",
    url: baseUrl,
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      category: "One-time license",
    },
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: comparison.faq.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: baseUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: `LeadStack vs ${comparison.competitorName}`,
        item: url,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplication),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}
