import type { Metadata } from "next";
import Link from "next/link";
import { CUSTOM_BRAND } from "@/config/landing";
import { getHelpArticles } from "@/lib/help-center/articles";

export const metadata: Metadata = {
  title: `${CUSTOM_BRAND.name} Help Center`,
  description: `Start here for setup, imports, billing, IDX Broker connection, and support.`,
};

export default function HelpPage() {
  const articles = getHelpArticles();
  const categories = articles.reduce<Record<string, typeof articles>>(
    (acc, article) => {
      acc[article.category] ??= [];
      acc[article.category].push(article);
      return acc;
    },
    {},
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        &larr; Back to home
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <h1>Help Center</h1>
        <p className="text-sm text-muted-foreground">Support for setup, operations, and account questions.</p>

        <p>
          This is the front door for help with {CUSTOM_BRAND.name}. If you&apos;re setting
          up your workspace, connecting tools, or troubleshooting a workflow,
          start here.
        </p>

        <h2>Help articles</h2>
        {Object.entries(categories).map(([category, entries]) => (
          <div key={category}>
            <h3>{category}</h3>
            <ul>
              {entries.map((article) => (
                <li key={article.slug}>
                  <Link href={`/help/${article.slug}`}>{article.title}</Link>
                  {article.description ? ` — ${article.description}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <p>
          Need a hand right away? Email{" "}
          <a href={`mailto:${CUSTOM_BRAND.supportEmail}`}>{CUSTOM_BRAND.supportEmail}</a>.
        </p>

        <p>
          This library lives inside the product so setup guides stay close to
          the workflows they support.
        </p>
      </article>
    </div>
  );
}
