import type { Metadata } from "next";
import Link from "next/link";
import { CUSTOM_BRAND } from "@/config/landing";

export const metadata: Metadata = {
  title: `${CUSTOM_BRAND.name} Help Center`,
  description: `Start here for setup, imports, billing, IDX Broker connection, and support.`,
};

const TOPICS = [
  "Getting started",
  "Importing contacts",
  "Billing and plan changes",
  "IDX Broker connection",
  "AI follow-up and persona setup",
  "Booking pages and lead forms",
];

export default function HelpPage() {
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

        <h2>Common help topics</h2>
        <ul>
          {TOPICS.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>

        <p>
          Need a hand right away? Email{" "}
          <a href={`mailto:${CUSTOM_BRAND.supportEmail}`}>{CUSTOM_BRAND.supportEmail}</a>.
        </p>

        <p>
          We&apos;ll expand this Help Center with guided setup articles and deeper
          troubleshooting documentation as the support library grows.
        </p>
      </article>
    </div>
  );
}
