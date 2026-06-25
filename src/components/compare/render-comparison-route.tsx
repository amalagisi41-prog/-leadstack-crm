import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LANDING_VARIANT } from "@/config/landing";
import { getComparison } from "@/data/comparisons";
import { ComparisonPage } from "@/components/compare/comparison-page";
import { ComparisonSchema } from "@/components/compare/comparison-schema";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";

/**
 * Shared route shell for every /leadstack-vs-{slug} static page.
 *
 * Why static routes instead of a dynamic [slug] segment: Next.js 15
 * Turbopack production builds (which this repo uses, per package.json)
 * have a known issue where a dynamic-route placeholder gets prerendered
 * as a 404 even with `generateStaticParams` declared. Bypassing that by
 * giving each competitor its own static folder is the simplest fix —
 * the route file is a one-liner that re-uses every shared component
 * and the centralised COMPARISONS manifest. Adding a competitor means
 * creating one new directory with one page.tsx; nothing else moves.
 *
 * Crawlability: every section is a server component, no "use client"
 * appears in the rendering tree, no useEffect runs on first paint.
 * Confirmed with curl after build — the full body copy lands in the
 * initial HTML response.
 */
export function buildComparisonMetadata(slug: string): Metadata {
  const comparison = getComparison(slug);
  if (!comparison || LANDING_VARIANT !== "leadstack") {
    return { title: "Not found" };
  }
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://leadstack.dev";
  const canonical = `${baseUrl}/leadstack-vs-${comparison.slug}`;
  return {
    title: comparison.metaTitle,
    description: comparison.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: comparison.metaTitle,
      description: comparison.metaDescription,
      url: canonical,
      type: "article",
      siteName: "LeadStack",
    },
    twitter: {
      card: "summary_large_image",
      title: comparison.metaTitle,
      description: comparison.metaDescription,
    },
    robots: { index: true, follow: true },
  };
}

export function ComparisonRoute({ slug }: { slug: string }) {
  if (LANDING_VARIANT !== "leadstack") notFound();
  const comparison = getComparison(slug);
  if (!comparison) notFound();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://leadstack.dev";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <ComparisonPage comparison={comparison} />
      </main>
      <Footer />
      <ComparisonSchema comparison={comparison} baseUrl={baseUrl} />
    </div>
  );
}
