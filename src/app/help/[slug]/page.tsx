import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CUSTOM_BRAND } from "@/config/landing";
import {
  getHelpArticle,
  getHelpArticles,
} from "@/lib/help-center/articles";

export function generateStaticParams() {
  return getHelpArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getHelpArticle(slug);

  if (!article) {
    return { title: "Help article not found" };
  }

  return {
    title: `${article.title} | ${CUSTOM_BRAND.name} Help Center`,
    description: article.description,
  };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getHelpArticle(slug);

  if (!article) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/help"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        &larr; Back to Help Center
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <p className="text-sm text-muted-foreground">{article.category}</p>
        <h1>{article.title}</h1>
        <p className="text-sm text-muted-foreground">{article.description}</p>
        <div dangerouslySetInnerHTML={{ __html: article.html }} />
      </article>
    </div>
  );
}
