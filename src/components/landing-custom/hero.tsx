import { Sparkles, ArrowRight, Clock, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResolvedBrand } from "@/config/landing";

const stats = [
  { icon: Clock, value: "< 60 sec", label: "first response" },
  { icon: TrendingUp, value: "3.4×", label: "more leads converted" },
  { icon: Zap, value: "1 day", label: "setup, no IT needed" },
];

const pipelineStages = [
  {
    stage: "New Inquiry",
    color: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    contacts: [
      { name: "Jennifer K.", note: "Zillow · 3BR Maplewood", time: "2m ago" },
      { name: "Alex T.", note: "Website form · Buyer", time: "18m ago" },
    ],
  },
  {
    stage: "Showing Scheduled",
    color: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    contacts: [
      { name: "Marcus D.", note: "124 Oak St · Sat 11am", time: "1h ago" },
      { name: "Priya S.", note: "Westfield condo · Sun 2pm", time: "3h ago" },
    ],
  },
  {
    stage: "Offer In",
    color: "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400",
    dot: "bg-purple-500",
    contacts: [
      { name: "Sarah W.", note: "$485k · 57 Elm · countered", time: "Yesterday" },
    ],
  },
  {
    stage: "Under Contract",
    color: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    contacts: [
      { name: "Chen Family", note: "Close Dec 15 · $620k", time: "3d ago" },
    ],
  },
];

export function Hero({ brand }: { brand: ResolvedBrand }) {
  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.18_263)_/_16%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,oklch(0.74_0.15_280)_/_12%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            <span className="bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              {brand.tagline}
            </span>
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-tighter sm:text-5xl md:text-6xl lg:text-[5rem] lg:leading-[1.04]">
            Never lose another lead{" "}
            <span className="inline-block bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-400 bg-clip-text pr-1 font-serif font-normal italic text-transparent">
              between showings.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
            {brand.shortDescription}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              render={<a href={`mailto:${brand.supportEmail}`} />}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 text-base"
            >
              Start Free <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              render={<a href="#how-it-works" />}
              variant="outline"
              size="lg"
              className="px-6 text-base"
            >
              See how it works
            </Button>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-4 sm:gap-8">
            {stats.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5 text-blue-500">
                  <Icon className="h-4 w-4" />
                  <span className="text-xl font-bold text-foreground sm:text-2xl">{value}</span>
                </div>
                <span className="text-xs text-muted-foreground sm:text-sm">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline mockup */}
        <div className="mx-auto mt-14 max-w-5xl">
          <div className="rounded-2xl border bg-card/60 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-red-400/70" />
              <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
              <div className="h-3 w-3 rounded-full bg-green-400/70" />
              <span className="ml-2 text-xs text-muted-foreground font-medium">
                Pipeline — Artisan Home Network
              </span>
            </div>
            <div className="grid grid-cols-2 gap-0 p-4 sm:grid-cols-4 sm:gap-3">
              {pipelineStages.map((col) => (
                <div key={col.stage} className="flex flex-col gap-2">
                  <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${col.color}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
                    {col.stage}
                  </div>
                  <div className="flex flex-col gap-2">
                    {col.contacts.map((c) => (
                      <div
                        key={c.name}
                        className="rounded-lg border bg-background p-2.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs font-medium">{c.name}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{c.time}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{c.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
