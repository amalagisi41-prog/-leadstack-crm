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

const pipelineStages = [
  {
    stage: "New Inquiry",
    color: "bg-blue-500/10 border-blue-500/20 text-blue-700",
    dot: "bg-blue-500",
    contacts: [
      { name: "Jennifer K.", note: "Zillow · 3BR Maplewood", time: "2m ago" },
      { name: "Alex T.", note: "Website · Buyer pre-approved", time: "18m ago" },
    ],
  },
  {
    stage: "Showing Scheduled",
    color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-700",
    dot: "bg-indigo-500",
    contacts: [
      { name: "Marcus D.", note: "47 Oak St · Sat 11am", time: "1h ago" },
      { name: "Priya S.", note: "Westfield · Sun 2pm", time: "3h ago" },
    ],
  },
  {
    stage: "Offer In",
    color: "bg-purple-500/10 border-purple-500/20 text-purple-700",
    dot: "bg-purple-500",
    contacts: [
      { name: "Sarah W.", note: "$485k · 57 Elm · countered", time: "Yesterday" },
    ],
  },
  {
    stage: "Under Contract",
    color: "bg-blue-500/10 border-blue-500/20 text-blue-700",
    dot: "bg-blue-600",
    contacts: [
      { name: "Chen Family", note: "Close Dec 15 · $620k", time: "3d ago" },
    ],
  },
];

export function Hero({ brand }: { brand: ResolvedBrand }) {
  return (
    <section className="relative overflow-hidden py-14 md:py-20">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,oklch(0.72_0.18_263)_/_14%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_right,oklch(0.74_0.15_280)_/_10%,transparent_55%)]" />

      <div className="container mx-auto px-4">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* Left: copy */}
          <div>
            {/* Stacked brand lockup — the above-the-fold hero mark. */}
            <div className="mb-7">
              <BrandLockupStacked brand={brand} />
            </div>

            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              <span className="bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                {brand.tagline}
              </span>
            </div>

            <h1 className="text-balance text-4xl font-semibold tracking-tighter sm:text-5xl md:text-[3.25rem] md:leading-[1.05]">
              Stop losing deals{" "}
              <span className="inline-block bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-400 bg-clip-text pr-1 font-serif font-normal italic text-transparent">
                between showings.
              </span>
            </h1>

            <p className="mt-5 max-w-lg text-pretty text-lg text-muted-foreground">
              {brand.shortDescription}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                render={<Link href="/signup" />}
                size="lg"
                className="bg-[#1a2f50] hover:bg-[#243d66] text-white px-6 text-base"
              >
                Start Free — No Card Needed <ArrowRight className="ml-2 h-4 w-4" />
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

            <div className="mt-10 flex items-center gap-8">
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

          {/* Right: pipeline mockup */}
          <div className="relative">
            <div className="rounded-2xl border bg-card shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-red-400/70" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
                <div className="h-3 w-3 rounded-full bg-green-400/70" />
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  Pipeline — AgentStack
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:gap-3 sm:p-4">
                {pipelineStages.map((col) => (
                  <div key={col.stage} className="flex flex-col gap-2">
                    <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold ${col.color}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
                      <span className="truncate">{col.stage}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {col.contacts.map((c) => (
                        <div
                          key={c.name}
                          className="rounded-lg border bg-background p-2 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-xs font-semibold">{c.name}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{c.time}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{c.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t bg-muted/30 px-4 py-2.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">6 active leads · 2 need follow-up</span>
                <span className="text-[10px] font-medium text-blue-500">Updated just now</span>
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-6 -right-6 -z-10 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
