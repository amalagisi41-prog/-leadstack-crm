import type { Metadata } from "next";
import { ArchitectureDiagram } from "@/components/docs/architecture-diagram";

export const metadata: Metadata = {
  title: "Architecture",
  description:
    "How LeadStack hangs together — eight product domains in one tube-map view.",
};

/**
 * Public architecture diagram page — the "London Tube map" view of
 * LeadStack's surface area. Lives at /docs/architecture and is reachable
 * without authentication because `/docs` is in the middleware's
 * PUBLIC_PATHS allowlist.
 *
 * The page is intentionally light — title + diagram + a short legend
 * caption. Anyone sharing the URL (sales decks, landing-page hero links,
 * RFP responses) gets a self-contained one-pager.
 */
export default function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Architecture · one-page view
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          LeadStack — what&apos;s in the box
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Eight product domains drawn as tube lines. Every line passes
          through <strong>Contact</strong> and is gated by{" "}
          <strong>Sub-Account</strong> — the central interchanges. Dashed
          bridges show how leads flow between domains: capture or AI
          conversations land as a Contact; the operator (or automation)
          reaches out via Comms; deals progress through the Sales line.
        </p>
      </header>
      <ArchitectureDiagram />
    </div>
  );
}
