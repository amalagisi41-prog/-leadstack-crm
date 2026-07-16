import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LANDING_VARIANT } from "@/config/landing";
import { getComparison, getComparisonPath } from "@/data/comparisons";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { ComparisonPage } from "@/components/compare/comparison-page";
import { ComparisonSchema } from "@/components/compare/comparison-schema";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";

export function buildPublicComparisonMetadata(slug: string): Metadata {
  const comparison = getComparison(slug);
  if (!comparison) {
    return { title: "Not found" };
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://agentstackcrm.app";
  const canonical = `${baseUrl}${getComparisonPath(comparison.slug)}`;

  return {
    title: comparison.metaTitle,
    description: comparison.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: comparison.metaTitle,
      description: comparison.metaDescription,
      url: canonical,
      type: "article",
      siteName: "AgentStack",
    },
    twitter: {
      card: "summary_large_image",
      title: comparison.metaTitle,
      description: comparison.metaDescription,
    },
    robots: { index: true, follow: true },
  };
}

export async function PublicComparisonRoute({ slug }: { slug: string }) {
  const comparison = getComparison(slug);
  if (!comparison) notFound();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://agentstackcrm.app";

  if (LANDING_VARIANT === "custom") {
    const brand = await resolveCustomBrand();

    return (
      <div className="flex min-h-screen flex-col bg-[#FFF6E8] text-[#173B7A] [color-scheme:light]">
        <CustomNavbar brand={brand} />
        <main className="flex-1">
          <ComparisonPage comparison={comparison} />
        </main>
        <CustomFooter brand={brand} />
        <ComparisonSchema comparison={comparison} baseUrl={baseUrl} />
      </div>
    );
  }

  notFound();
}
