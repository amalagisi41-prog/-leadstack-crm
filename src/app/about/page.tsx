import type { Metadata } from "next";
import Link from "next/link";
import { CUSTOM_BRAND } from "@/config/landing";

export const metadata: Metadata = {
  title: `About — AgentStack CRM`,
  description: `Why AgentStack CRM exists, who it's built for, and how we think about running a modern real estate business.`,
  openGraph: { title: `About — AgentStack CRM` },
  twitter: { title: `About — AgentStack CRM` },
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

        <h2>Built by an agent who couldn&apos;t buy what he needed.</h2>
        <p>AgentStack was built by Franco Malagisi, a licensed Connecticut real estate agent and investor who ran his business on the same tools everyone else uses — and spent more time configuring them than closing. AgentStack is the system he wanted: set up once, in about fifteen minutes, with follow-up that runs itself and a pipeline that always shows the next action. It&apos;s built for realtors only, because that&apos;s the business it was born in.</p>
        <p>Automated messaging and AI remain Private Preview; see <Link href="/availability">feature availability</Link> before activation.</p>
        <p><Link href="/signup">Create your AgentStack CRM workspace</Link></p>

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
