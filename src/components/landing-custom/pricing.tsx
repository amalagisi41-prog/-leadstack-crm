"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CUSTOM_BRAND } from "@/config/landing";

export function Pricing() {
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [billingInterval, setBillingInterval] = useState<"month" | "year">(
    "month"
  );
  const offer = CUSTOM_BRAND.pricing.starter;

  async function startCheckout() {
    setCheckoutError("");
    setLoading(true);
    try {
      const res = await fetch("/api/checkout/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: "starter", billingInterval }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout. Try again.");
      }
      window.location.href = data.url;
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Could not start checkout. Try again."
      );
      setLoading(false);
    }
  }

  return (
    <section id="pricing" className="bg-white py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-2 text-sm font-semibold tracking-[0.28em] text-[#173B7A] uppercase">
            One beta offer
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
            Solo Founding Beta.{" "}
            <span className="font-sans font-normal text-[#DB4F9B] italic">
              One clear path.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#526078] sm:text-lg">
            Guided six-step setup, one workspace, and the core
            lead-to-appointment workflow. Features outside the beta scope are
            labeled before you subscribe.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-xl overflow-hidden rounded-[1.75rem] border border-[#173B7A]/20 bg-[#FFFDFC] shadow-[0_20px_60px_rgba(23,59,122,0.10)] ring-1 ring-[#173B7A]/10">
          <div className="bg-[#173B7A] px-7 py-7 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-100">
                  <Sparkles className="h-4 w-4" /> Founding member access
                </div>
                <p className="mt-2 text-2xl font-semibold">{offer.name}</p>
              </div>
              <div className="text-right">
                <span className="text-4xl font-bold">
                  $
                  {billingInterval === "year"
                    ? offer.priceAnnual
                    : offer.priceMonthly}
                </span>
                <span className="text-blue-100/70">/mo</span>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-blue-100/75">
              Charged today. Includes one bonus month; renews{" "}
              {billingInterval === "year"
                ? "at $1,188 yearly after 13 months"
                : "at $149 monthly after 2 months"}
              . Cancel before renewal from your billing portal.
            </p>
          </div>

          <div className="p-7">
            <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#173B7A]/5 p-1">
              <button
                type="button"
                onClick={() => setBillingInterval("month")}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${billingInterval === "month" ? "bg-white text-[#173B7A] shadow-sm" : "text-[#526078]"}`}
              >
                Monthly · $149
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval("year")}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${billingInterval === "year" ? "bg-white text-[#173B7A] shadow-sm" : "text-[#526078]"}`}
              >
                Annual · $99/mo
              </button>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {offer.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-[#173B7A]"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#4F91FF]/15 text-[#4F91FF]">
                    <Check className="h-3 w-3" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              onClick={startCheckout}
              disabled={loading}
              className="mt-7 w-full bg-[#173B7A] text-white hover:bg-[#244c8e]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting secure checkout…
                </>
              ) : (
                offer.cta
              )}
            </Button>
            {checkoutError && (
              <p className="mt-3 text-center text-xs text-red-600">
                {checkoutError}
              </p>
            )}
            <p className="mt-4 text-center text-xs leading-5 text-[#7B8AA1]">
              Payment collected today · card securely stored by Stripe ·
              automatic renewal unless canceled · add-ons charged only with
              approval
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
