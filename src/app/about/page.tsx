import type { Metadata } from "next";
import Link from "next/link";
import { CUSTOM_BRAND } from "@/config/landing";

export const metadata: Metadata = {
  title: `About ${CUSTOM_BRAND.name}`,
  description: `Why ${CUSTOM_BRAND.name} exists, who it's built for, and how we think about running a modern real estate business.`,
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        &larr; Back to home
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <h1>About {CUSTOM_BRAND.name}</h1>
        <p className="text-sm text-muted-foreground">Built for modern real estate operators.</p>

        <p>
          {CUSTOM_BRAND.name} is the operating system for real estate professionals who
          need more than a contact database. It brings lead capture, instant
          response, pipeline visibility, follow-up, and scheduling into one
          place so the business keeps moving while you&apos;re with clients.
        </p>

        <p>
          We built it for agents and teams who are tired of stitching together
          forms, CRMs, texting tools, spreadsheets, and reminders just to stay
          on top of the basics. The goal is simple: less setup, faster
          follow-up, clearer next steps, and more time spent closing.
        </p>

        <h2>What we believe</h2>
        <ul>
          <li>Speed to lead matters.</li>
          <li>Follow-up should run even when you can&apos;t.</li>
          <li>Your pipeline should show what needs attention at a glance.</li>
          <li>Software should remove admin work, not create more of it.</li>
        </ul>

        <h2>Founder note</h2>
        <blockquote>
          <p>
            {CUSTOM_BRAND.name} exists because too many real estate professionals are
            still running serious businesses out of disconnected tools and
            memory. We wanted one system that helps you respond faster, stay
            organized, and keep momentum with less friction every day.
          </p>
        </blockquote>

        <p>
          If you&apos;d like to learn more, visit the{" "}
          <Link href="/help">Help Center</Link>, review our{" "}
          <Link href="/security">Security</Link> page, or email{" "}
          <a href={`mailto:${CUSTOM_BRAND.supportEmail}`}>{CUSTOM_BRAND.supportEmail}</a>.
        </p>
      </article>
    </div>
  );
}
