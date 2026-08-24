import Link from "next/link";
import {
  LEGAL_ENTITY,
  legalConfigGaps,
  type LegalEntityConfig,
} from "@/config/legal";

/**
 * Shared chrome for the published legal documents.
 *
 * The one behaviour that matters: a document with unset company details must
 * be impossible to mistake for a finished one. Each gap renders as a loud
 * inline marker naming the field, and the page opens with a banner listing
 * every field still missing and the environment variable that sets it.
 *
 * The alternative — a quiet blank, or an em dash — reads as finished text and
 * is how a policy naming no entity, or citing no venue, ends up published.
 */

export function LegalValue({
  value,
  field,
}: {
  value: string;
  field: string;
}) {
  if (value) return <>{value}</>;
  return (
    <mark className="rounded bg-rose-100 px-1 font-semibold text-rose-900 not-prose">
      [SET {field}]
    </mark>
  );
}

export function LegalDocument({
  title,
  intro,
  config = LEGAL_ENTITY,
  children,
}: {
  title: string;
  /**
   * Optional note under the heading — a draft/review disclaimer, or any
   * other caveat that belongs above the document body. Omit once a document
   * has cleared counsel review; there is nothing to warn a reader about at
   * that point, so no box renders instead of an empty one.
   */
  intro?: React.ReactNode;
  config?: LegalEntityConfig;
  children: React.ReactNode;
}) {
  const gaps = legalConfigGaps(config);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="text-muted-foreground hover:text-primary text-sm"
      >
        &larr; Back to home
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <h1>{title}</h1>
        <p className="text-muted-foreground text-sm">
          Effective date:{" "}
          <LegalValue value={config.effectiveDate} field="EFFECTIVE DATE" />
        </p>

        {gaps.length > 0 ? (
          <div className="not-prose rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm">
            <p className="font-semibold text-rose-900 dark:text-rose-200">
              Not ready to publish — {gaps.length}{" "}
              {gaps.length === 1 ? "field is" : "fields are"} unset
            </p>
            <p className="mt-1 text-rose-900/80 dark:text-rose-200/80">
              This document names no company details until these are set. Each
              appears in the text below highlighted in red.
            </p>
            <ul className="mt-2 space-y-1">
              {gaps.map((gap) => (
                <li key={gap.key} className="text-rose-900 dark:text-rose-200">
                  <strong>{gap.label}</strong> —{" "}
                  <code className="text-xs">{gap.envVar}</code>{" "}
                  <span className="opacity-70">e.g. {gap.example}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {intro ? (
          <div className="not-prose rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            {intro}
          </div>
        ) : null}

        {children}

        <h2>Contact</h2>
        <p>
          <strong>
            <LegalValue value={config.legalName} field="LEGAL COMPANY NAME" />
          </strong>
          <br />
          {config.mailingAddress ? (
            <>
              {config.mailingAddress}
              <br />
            </>
          ) : null}
          Email:{" "}
          <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
        </p>
      </article>
    </div>
  );
}
