"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CUSTOM_BRAND, type CustomPricingTier } from "@/config/landing";

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  // Solo Beta: Team/Broker/Luxury Broker stay defined in CUSTOM_BRAND.pricing
  // (so re-enabling them post-beta is a one-line revert) but aren't offered
  // on the public landing page while the product is Solo-only.
  const tiers: CustomPricingTier[] = [CUSTOM_BRAND.pricing.starter];

  return (
    <section id="pricing" className="bg-white py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
            Pricing
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
            Simple pricing.{" "}
            <span className="font-sans font-normal italic text-[#DB4F9B]">
              Cancel anytime.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#526078] sm:text-lg">
            Pick the plan that fits your volume. Upgrade, downgrade, or cancel
            from your account in two clicks.
          </p>

          <div className="mx-auto mt-8 inline-flex items-center gap-1 rounded-full border border-[#E7DCC7] bg-[#FFF8EF] p-1">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                !annual
                  ? "bg-white text-[#173B7A] shadow-sm"
                  : "text-[#7B8AA1] hover:text-[#173B7A]",
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                annual
                  ? "bg-white text-[#173B7A] shadow-sm"
                  : "text-[#7B8AA1] hover:text-[#173B7A]",
              )}
            >
              Annual
              <span className="rounded-full bg-[#DB4F9B]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#DB4F9B]">
                save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-md gap-6">
          {tiers.map((tier) => {
            const price = annual ? tier.priceAnnual : tier.priceMonthly;
            const isFree = price === 0;
            return (
              <div
                key={tier.name}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-[1.75rem] border bg-[#FFFDFC]",
                  tier.highlighted
                    ? "border-[#173B7A]/20 shadow-[0_20px_60px_rgba(23,59,122,0.10)] ring-1 ring-[#173B7A]/10"
                    : "border-[#E7DCC7] shadow-[0_12px_32px_rgba(23,59,122,0.05)]",
                )}
              >
                {tier.highlighted && (
                  <div className="absolute -top-px left-1/2 -translate-x-1/2">
                    <div className="flex items-center gap-1 rounded-b-full bg-[#173B7A] px-3 py-1 text-xs font-semibold text-white">
                      <Sparkles className="h-3 w-3" />
                      Most popular
                    </div>
                  </div>
                )}

                <div
                  className={cn(
                    "px-6 pb-5 pt-8",
                    tier.highlighted ? "bg-[#173B7A]" : "bg-[#FFF8EF]",
                  )}
                >
                  <p
                    className={cn(
                      "text-lg font-semibold",
                      tier.highlighted ? "text-white" : "text-[#173B7A]",
                    )}
                  >
                    {tier.name}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-sm",
                      tier.highlighted ? "text-blue-100/70" : "text-[#526078]",
                    )}
                  >
                    {tier.blurb}
                  </p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span
                      className={cn(
                        "text-4xl font-bold tracking-tight",
                        tier.highlighted ? "text-white" : "text-[#173B7A]",
                      )}
                    >
                      {isFree ? "Free" : `$${price}`}
                    </span>
                    {!isFree && (
                      <span
                        className={cn(
                          tier.highlighted ? "text-blue-100/60" : "text-[#7B8AA1]",
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
                        tier.highlighted ? "text-blue-100/50" : "text-[#7B8AA1]",
                      )}
                    >
                      {annual
                        ? `Billed $${price * 12}/yr · save $${(tier.priceMonthly - tier.priceAnnual) * 12}`
                        : "Billed monthly · cancel anytime"}
                    </p>
                  )}
                </div>

                <div className="flex flex-1 flex-col px-6 py-5">
                  <ul className="flex-1 space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#4F91FF]/15 text-[#4F91FF]">
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="text-[#173B7A]">{feature}</span>
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
                          "bg-white text-[#173B7A] hover:bg-blue-50",
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

        <p className="mx-auto mt-8 max-w-lg text-center text-xs leading-6 text-[#7B8AA1]">
          All plans include unlimited pipeline stages, lead forms, calendar, and
          tasks. No per-contact tax. No per-message metering.
        </p>
      </div>
    </section>
  );
}
