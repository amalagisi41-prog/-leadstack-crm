import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ResolvedBrand } from "@/config/landing";
import { BrandLockupStacked } from "./brand-lockup";

export function Hero({ brand }: { brand: ResolvedBrand }) {
  const pill = (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#1b3d7a]/20 bg-[#1b3d7a]/[0.06] px-4 py-1.5 text-xs font-semibold text-[#1b3d7a] sm:text-sm">
      <span>{brand.tagline}</span>
    </span>
  );

  return (
    <section className="relative overflow-hidden py-14 md:py-20">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,oklch(0.72_0.18_263)_/_14%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_right,oklch(0.74_0.15_280)_/_10%,transparent_55%)]" />

      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center text-center">
          <div className="mb-8 md:mb-10">
            <BrandLockupStacked brand={brand} pill={pill} />
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-tighter sm:text-5xl md:text-[3.25rem] md:leading-[1.05]">
            You&apos;re with a client.{" "}
            <span className="inline-block bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-400 bg-clip-text pr-1 font-serif font-normal italic text-transparent">
              AgentStack is running your business.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
            Never miss another lead, showing, or follow-up while serving the
            client in front of you.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              render={<Link href="/signup" />}
              size="lg"
              className="bg-[#1a2f50] hover:bg-[#243d66] text-white px-6 text-base"
            >
              Start Free <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              render={<a href="#video-teaser" />}
              variant="outline"
              size="lg"
              className="text-base"
            >
              <Play className="mr-2 h-4 w-4" />
              See How It Works
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
