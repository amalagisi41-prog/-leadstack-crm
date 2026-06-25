import Link from "next/link";
import { Check, X, Sparkles, Quote, ChevronRight } from "lucide-react";
import type { Comparison } from "@/types/comparisons";
import { listComparisons } from "@/data/comparisons";
import { ComparisonCalculator } from "@/components/compare/comparison-calculator";

/**
 * Server-rendered competitor comparison page. Every piece of body copy
 * lives in the static HTML response — no client-side fetches, no
 * useEffect, no dynamic({ ssr: false }). Googlebot sees the full content
 * on first load. Verify with: curl <url> | grep "<the H1 text>"
 *
 * Interactive bits (FAQ accordion, etc.) deliberately stay as plain
 * <details> elements so they don't need a client boundary. The whole
 * page is HTML the moment Vercel's edge serves it.
 */
export function ComparisonPage({ comparison }: { comparison: Comparison }) {
  return (
    <article className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <Hero comparison={comparison} />
      <PullQuote comparison={comparison} />
      <PainPoints comparison={comparison} />
      <Advantages comparison={comparison} />
      <FeatureTable comparison={comparison} />
      <PricingTable comparison={comparison} />
      <ComparisonCalculator />
      <CompetitorWins comparison={comparison} />
      <FAQ comparison={comparison} />
      <CrossLink currentSlug={comparison.slug} />
      <FinalCta comparison={comparison} />
      <Disclaimer comparison={comparison} />
    </article>
  );
}

function Hero({ comparison }: { comparison: Comparison }) {
  return (
    <header className="mb-12 text-center sm:mb-16">
      <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Independent comparison
      </p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        {comparison.hero.h1}
      </h1>
      <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
        {comparison.hero.subhead}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/#pricing"
          data-cta="comparison-hero"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {comparison.hero.ctaLabel}
        </Link>
        <a
          href="#feature-table"
          className="inline-flex h-11 items-center rounded-lg border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
        >
          Jump to feature comparison
        </a>
      </div>
    </header>
  );
}

function PullQuote({ comparison }: { comparison: Comparison }) {
  return (
    <section className="mb-12 sm:mb-16">
      <blockquote className="relative rounded-2xl border bg-card p-8 sm:p-10">
        <Quote className="absolute left-6 top-6 h-6 w-6 text-muted-foreground/30" />
        <p className="pl-10 text-lg italic leading-relaxed text-foreground sm:text-xl">
          &ldquo;{comparison.pullQuote.text}&rdquo;
        </p>
        <footer className="mt-5 pl-10 text-sm text-muted-foreground">
          <strong className="text-foreground">{comparison.pullQuote.author}</strong>
          {comparison.pullQuote.role ? ` · ${comparison.pullQuote.role}` : null}
        </footer>
      </blockquote>
    </section>
  );
}

function PainPoints({ comparison }: { comparison: Comparison }) {
  return (
    <section className="mb-12 sm:mb-16">
      <h2 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
        {comparison.painPoints.heading}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {comparison.painPoints.bullets.map((bullet) => (
          <div
            key={bullet.title}
            className="rounded-2xl border bg-card p-6"
          >
            <h3 className="mb-2 text-base font-semibold">{bullet.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {bullet.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Advantages({ comparison }: { comparison: Comparison }) {
  return (
    <section className="mb-12 sm:mb-16">
      <h2 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
        How LeadStack is different
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {comparison.advantages.map((advantage) => (
          <div
            key={advantage.title}
            className="rounded-2xl border bg-card p-6"
          >
            <h3 className="mb-2 text-base font-semibold">{advantage.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {advantage.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureTable({ comparison }: { comparison: Comparison }) {
  return (
    <section id="feature-table" className="mb-12 scroll-mt-24 sm:mb-16">
      <h2 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
        {comparison.featureTable.heading}
      </h2>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-semibold sm:px-6">
                Feature
              </th>
              <th className="px-4 py-3 text-center font-semibold sm:px-6">
                LeadStack
              </th>
              <th className="px-4 py-3 text-center font-semibold sm:px-6">
                {comparison.competitorShortName ?? comparison.competitorName}
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.featureTable.rows.map((row, i) => (
              <tr
                key={row.label}
                className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
              >
                <td className="px-4 py-3 sm:px-6">{row.label}</td>
                <td className="px-4 py-3 text-center sm:px-6">
                  <FeatureCell value={row.leadstack} positive />
                </td>
                <td className="px-4 py-3 text-center sm:px-6">
                  <FeatureCell value={row.competitor} positive={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FeatureCell({
  value,
  positive,
}: {
  value: boolean | string;
  positive: boolean;
}) {
  if (value === true) {
    return (
      <span
        aria-label="Included"
        className={
          positive
            ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-500"
        }
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        aria-label="Not included"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400"
      >
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="text-xs leading-relaxed text-muted-foreground">
      {value}
    </span>
  );
}

function PricingTable({ comparison }: { comparison: Comparison }) {
  return (
    <section className="mb-12 sm:mb-16">
      <h2 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
        {comparison.pricing.heading}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <PricingCard
          headline={comparison.pricing.leadstack.headline}
          detail={comparison.pricing.leadstack.detail}
          notes={comparison.pricing.leadstack.notes}
          variant="leadstack"
        />
        <PricingCard
          headline={comparison.pricing.competitor.headline}
          detail={comparison.pricing.competitor.detail}
          notes={comparison.pricing.competitor.notes}
          variant="competitor"
        />
      </div>
      <p className="mt-5 rounded-xl border bg-muted/20 p-5 text-sm leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Bottom line:</strong>{" "}
        {comparison.pricing.summary}
      </p>
    </section>
  );
}

function PricingCard({
  headline,
  detail,
  notes,
  variant,
}: {
  headline: string;
  detail: string;
  notes: string[];
  variant: "leadstack" | "competitor";
}) {
  return (
    <div
      className={
        variant === "leadstack"
          ? "rounded-2xl border-2 border-emerald-500/40 bg-card p-6"
          : "rounded-2xl border-2 border-rose-500/40 bg-card p-6"
      }
    >
      <h3 className="text-base font-semibold">{headline}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {detail}
      </p>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        {notes.map((note) => (
          <li key={note} className="flex gap-2">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompetitorWins({ comparison }: { comparison: Comparison }) {
  const wins = comparison.competitorWins;
  if (!wins) return null;
  return (
    <section className="mb-12 sm:mb-16">
      <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
        {wins.heading}
      </h2>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        We won&apos;t pretend the comparison is one-sided.
      </p>
      <div className="rounded-2xl border bg-card p-6">
        <ul className="space-y-3 text-sm leading-relaxed">
          {wins.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
          {wins.closing}
        </p>
      </div>
    </section>
  );
}

function FAQ({ comparison }: { comparison: Comparison }) {
  return (
    <section className="mb-12 sm:mb-16">
      <h2 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
        {comparison.faq.heading}
      </h2>
      <div className="divide-y rounded-2xl border bg-card">
        {comparison.faq.items.map((item) => (
          <details key={item.question} className="group p-6">
            <summary className="flex cursor-pointer items-start justify-between gap-4 text-base font-medium [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CrossLink({ currentSlug }: { currentSlug: string }) {
  const others = listComparisons().filter((c) => c.slug !== currentSlug);
  if (others.length === 0) return null;
  return (
    <section className="mb-12 sm:mb-16">
      <h2 className="mb-4 text-xl font-bold tracking-tight">
        Compare LeadStack to other tools
      </h2>
      <div className="flex flex-wrap gap-2">
        {others.map((other) => (
          <Link
            key={other.slug}
            href={`/leadstack-vs-${other.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm transition-colors hover:bg-muted"
          >
            LeadStack vs {other.competitorName}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function FinalCta({ comparison }: { comparison: Comparison }) {
  return (
    <section className="mb-12 rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-8 text-center sm:p-12">
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {comparison.finalCta.headline}
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
        {comparison.finalCta.body}
      </p>
      <div className="mt-6">
        <Link
          href={comparison.finalCta.primaryCtaHref}
          data-cta="comparison-final"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {comparison.finalCta.primaryCtaLabel}
        </Link>
      </div>
    </section>
  );
}

function Disclaimer({ comparison }: { comparison: Comparison }) {
  return (
    <footer className="border-t pt-6 text-xs leading-relaxed text-muted-foreground">
      <p>
        Pricing and feature claims about {comparison.competitorName} reflect
        publicly published information as of {comparison.lastVerifiedDate}.
        Comparison provided for informational purposes; verify current
        {" "}details on the {comparison.competitorName} website before making
        a purchasing decision. All trademarks are property of their
        respective owners. This is an independent comparison and LeadStack
        is not affiliated with or endorsed by {comparison.competitorName}.
      </p>
    </footer>
  );
}
