"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CUSTOM_BRAND, type CustomPricingTier } from "@/config/landing";

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  const tiers: CustomPricingTier[] = [
    CUSTOM_BRAND.pricing.starter,
    CUSTOM_BRAND.pricing.pro,
    CUSTOM_BRAND.pricing.scale,
    CUSTOM_BRAND.pricing.luxury,
  ];

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 mb-2">
            Pricing
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            Simple pricing.{" "}
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text font-sans font-normal italic text-transparent">
              Cancel anytime.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Pick the plan that fits your volume. Upgrade, downgrade, or cancel
            from your account in two clicks.
          </p>

          <div className="mx-auto mt-8 inline-flex items-center gap-1 rounded-full border bg-muted/50 p-1">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                !annual
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                annual
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Annual
              <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier) => {
            const price = annual ? tier.priceAnnual : tier.priceMonthly;
            const isFree = price === 0;
            return (
              <div
                key={tier.name}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-2xl border bg-card",
                  tier.highlighted
                    ? "border-[#1a2f50]/40 shadow-xl shadow-[#1a2f50]/10 ring-2 ring-[#1a2f50]/20"
                    : "border-border shadow-sm",
                )}
              >
                {tier.highlighted && (
                  <div className="absolute -top-px left-1/2 -translate-x-1/2">
                    <div className="flex items-center gap-1 rounded-b-full bg-[#1a2f50] px-3 py-1 text-xs font-semibold text-white">
                      <Sparkles className="h-3 w-3" />
                      Most popular
                    </div>
                  </div>
                )}

                {/* Card header */}
                <div
                  className={cn(
                    "px-6 pt-8 pb-5",
                    tier.highlighted ? "bg-[#1a2f50]" : "",
                  )}
                >
                  <p
                    className={cn(
                      "text-lg font-semibold",
                      tier.highlighted ? "text-white" : "text-foreground",
                    )}
                  >
                    {tier.name}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-sm",
                      tier.highlighted ? "text-blue-200/70" : "text-muted-foreground",
                    )}
                  >
                    {tier.blurb}
                  </p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span
                      className={cn(
                        "text-4xl font-bold tracking-tight",
                        tier.highlighted ? "text-white" : "text-foreground",
                      )}
                    >
                      {isFree ? "Free" : `$${price}`}
                    </span>
                    {!isFree && (
                      <span
                        className={cn(
                          tier.highlighted
                            ? "text-blue-200/60"
                            : "text-muted-foreground",
                        )}
                      >
                        /mo
                      </span>
                    )}
                  </div>
                  {!isFree && (
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        tier.highlighted
                          ? "text-blue-200/50"
                          : "text-muted-foreground",
                      )}
                    >
                      {annual
                        ? `Billed $${price * 12}/yr · save $${(tier.priceMonthly - tier.priceAnnual) * 12}`
                        : "Billed monthly · cancel anytime"}
                    </p>
                  )}
                </div>

                {/* Features + CTA */}
                <div className="flex flex-1 flex-col px-6 py-5">
                  <ul className="flex-1 space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <Button
                      render={<Link href="/signup" />}
                      variant={tier.highlighted ? "default" : "outline"}
                      className={cn(
                        "w-full",
                        tier.highlighted &&
                          "bg-[#1a2f50] hover:bg-[#243d66] text-white",
                      )}
                    >
                      {tier.cta}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-lg text-center text-xs text-muted-foreground">
          All plans include unlimited pipeline stages, lead forms, calendar, and
          tasks. No per-contact tax. No per-message metering.
        </p>
      </div>
    </section>
  );
}
