import { Sparkles, ArrowRight, Clock, TrendingUp, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ResolvedBrand } from "@/config/landing";
import { BrandLockupStacked } from "./brand-lockup";

const stats = [
  { icon: TrendingUp, value: "2.3×", label: "more leads converted" },
  { icon: Clock, value: "< 60s", label: "first response time" },
  { icon: DollarSign, value: "$0", label: "setup fee" },
];

export function Hero({ brand }: { brand: ResolvedBrand }) {
  const pill = (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#1b3d7a]/20 bg-[#1b3d7a]/[0.06] px-4 py-1.5 text-xs font-semibold text-[#1b3d7a] sm:text-sm">
      <Sparkles className="h-3.5 w-3.5 text-[#3b82f6] sm:h-4 sm:w-4" />
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
            Stop losing deals{" "}
            <span className="inline-block bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-400 bg-clip-text pr-1 font-serif font-normal italic text-transparent">
              between showings.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
            {brand.shortDescription}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              render={<Link href="/signup" />}
              size="lg"
              className="bg-[#1a2f50] hover:bg-[#243d66] text-white px-6 text-base"
            >
              Start Free — No Card Needed <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="mt-10 flex items-center justify-center gap-8">
            {stats.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-blue-500" />
                  <span className="text-2xl font-bold text-foreground">{value}</span>
                </div>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
