import type { MetadataRoute } from "next";
import { LANDING_VARIANT } from "@/config/landing";
import { COMPARISON_SLUGS, getComparisonPath } from "@/data/comparisons";
import { getHelpArticles } from "@/lib/help-center/articles";

/**
 * Sitemap. Next.js 15 picks this file up automatically and serves the
 * generated XML at /sitemap.xml.
 *
 * Variant-aware: the AgentStack-branded deployment publishes the public
 * docs + comparison pages it actually hosts. White-label buyer clones
 * (LANDING_VARIANT === "custom") publish only the buyer's own marketing
 * surface — listing AgentStack's vs pages in their sitemap would
 * advertise 404s.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://leadstack.dev";
  const now = new Date();
  const helpArticles = getHelpArticles();

  const sharedEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/help`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    ...helpArticles.map((article) => ({
      url: `${baseUrl}/help/${article.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    { url: `${baseUrl}/playbook`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/security`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...COMPARISON_SLUGS.map((slug) => ({
      url: `${baseUrl}${getComparisonPath(slug)}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  if (LANDING_VARIANT !== "leadstack") {
    return sharedEntries;
  }

  const leadstackOnly: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/docs/api`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/docs/architecture`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/docs/updating`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/affiliate-program`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  return [...sharedEntries, ...leadstackOnly];
}
