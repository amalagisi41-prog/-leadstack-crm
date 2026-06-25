import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { LANDING_VARIANT } from "@/config/landing";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { ChatCta, ChatLink } from "./chat-cta";

export const metadata: Metadata = {
  title: "About us",
  description:
    "We are a small software development company based in Melbourne, Australia, building practical web apps.",
};

/**
 * High-level About page. LeadStack-branded — only served on the
 * "leadstack" landing variant; under the white-label "custom" variant it
 * 404s (the buyer's own deployment shouldn't expose our company's About).
 */

const APPS = [
  {
    name: "LeadStack",
    domain: "leadstack.dev",
    href: "https://leadstack.dev",
    blurb: "All-in-one, white-label CRM for agencies and small teams.",
  },
  {
    name: "GitPage",
    domain: "gitpage.site",
    href: "https://gitpage.site",
    blurb: "Marketing sites and landing pages, generated and live in minutes.",
  },
  {
    name: "SigmaSEO",
    domain: "sigmaseo.io",
    href: "https://sigmaseo.io",
    blurb: "SEO tooling to audit, optimise, and grow organic search traffic.",
  },
];

export default function AboutPage() {
  if (LANDING_VARIANT !== "leadstack") {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="container mx-auto px-4 py-20 sm:py-28">
          {/* Intro */}
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-violet-500">
              About us
            </p>
            <h1 className="mt-3 text-lg font-semibold leading-relaxed">
              We are a small software development company based in Melbourne, Australia.
            </h1>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                We design and build practical web apps and digital tools that
                help businesses capture leads, launch online, and grow. A small
                team shipping focused, dependable software.
              </p>
              <p>
                Established in 2007, we&apos;ve been building software for well
                over a decade. Since 2021, our focus has been on developing
                tools and resources that help solopreneurs and small businesses
                grow and scale online &mdash; leveraging AI and AI agents.
              </p>
              <p>
                Beyond application development, we also provide coaching and
                training to help you grow in the online space and make the most
                of AI tools and resources.
              </p>
              <p>
                If you have any questions about us or would like more
                information, contact us via the <ChatLink>chat</ChatLink>.
              </p>
            </div>
          </div>

          {/* Apps */}
          <div className="mx-auto mt-16 max-w-3xl">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Our apps
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {APPS.map((app) => (
                <a
                  key={app.domain}
                  href={app.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-2xl border bg-card p-5 transition-colors hover:border-violet-500/50"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold">{app.name}</p>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-violet-500" />
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-violet-500">
                    {app.domain}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {app.blurb}
                  </p>
                </a>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="mx-auto mt-16 max-w-3xl rounded-2xl border bg-muted/30 p-8 text-center">
            <h2 className="text-xl font-semibold">Want to know more?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              For further information, get in touch with us via chat.
            </p>
            <div className="mt-5 flex justify-center">
              <ChatCta />
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-3xl text-center">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Back to home
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
