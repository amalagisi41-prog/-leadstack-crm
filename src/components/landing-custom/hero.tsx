import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResolvedBrand } from "@/config/landing";

export function Hero({ brand }: { brand: ResolvedBrand }) {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.16_165)_/_18%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,oklch(0.74_0.13_185)_/_14%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />

      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
              {brand.tagline}
            </span>
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-tighter sm:text-5xl md:text-6xl lg:text-[5rem] lg:leading-[1.04]">
            The CRM your team will{" "}
            <span className="inline-block bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text pr-1 font-serif font-normal text-transparent">
              actually use
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
            {brand.shortDescription}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              render={<a href={`mailto:${brand.supportEmail}`} />}
              size="lg"
              className="px-6 text-base"
            >
              Talk to us
            </Button>
            <Button
              render={<a href="#features" />}
              variant="outline"
              size="lg"
              className="px-6 text-base"
            >
              See features
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
