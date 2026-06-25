"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CUSTOM_BRAND, type CustomPricingTier } from "@/config/landing";

// Pricing buttons currently route to /signup. When you wire Stripe, swap
// the Subscribe button to call createCheckoutSession with the relevant
// STRIPE_PRO_PRICE_ID / STRIPE_SCALE_PRICE_ID.

export function Pricing() {
  const [annual, setAnnual] = useState(true);

  const tiers: CustomPricingTier[] = [
    CUSTOM_BRAND.pricing.starter,
    CUSTOM_BRAND.pricing.pro,
    CUSTOM_BRAND.pricing.scale,
  ];

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Pricing
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-5xl">
            Simple pricing.{" "}
            <span className="font-serif font-normal italic">
              Cancel anytime.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Pick the plan that fits. Upgrade, downgrade, or cancel from
            your account in two clicks.
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
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
          {tiers.map((tier) => {
            const price = annual ? tier.priceAnnual : tier.priceMonthly;
            const isFree = price === 0;
            return (
              <Card
                key={tier.name}
                className={cn(
                  "flex flex-col",
                  tier.highlighted &&
                    "relative border-primary shadow-xl shadow-primary/10 ring-2 ring-primary/30",
                )}
              >
                {tier.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 px-3">
                    <Sparkles className="h-3 w-3" />
                    Most popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                  <CardDescription>{tier.blurb}</CardDescription>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">
                      {isFree ? "Free" : `$${price}`}
                    </span>
                    {!isFree && (
                      <span className="text-muted-foreground">/mo</span>
                    )}
                  </div>
                  {!isFree && (
                    <p className="text-xs text-muted-foreground">
                      {annual
                        ? `Billed $${price * 12}/yr · save $${(tier.priceMonthly - tier.priceAnnual) * 12}`
                        : "Billed monthly · cancel anytime"}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                            tier.highlighted
                              ? "bg-primary text-primary-foreground"
                              : "bg-primary/10 text-primary",
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    render={<Link href="/signup" />}
                    variant={tier.highlighted ? "default" : "outline"}
                    className="w-full"
                  >
                    {tier.cta}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-lg text-center text-xs text-muted-foreground">
          All plans include unlimited contacts, pipeline, forms, automations,
          and the website builder. No per-contact tax, no per-message
          metering.
        </p>
      </div>
    </section>
  );
}
