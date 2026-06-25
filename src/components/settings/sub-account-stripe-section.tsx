"use client";

import { CreditCard } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";

/**
 * Stripe Connect roadmap placeholder. v1 ships PayPal-only payment
 * collection (see SubAccountPayPalSection). Stripe Connect is on the
 * roadmap — when it lands, the sub-account owner will click "Connect
 * with Stripe" and OAuth through to grant the platform permission to
 * issue charges on their behalf (no key-pasting). Keeps the surface
 * visible so operators know it's coming and stop asking.
 */

export function SubAccountStripeSection() {
  const { isAdmin } = useSubAccount();
  if (!isAdmin) return null;

  return (
    <section className="rounded-2xl border border-dashed bg-card/50 p-6 opacity-75">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <CreditCard className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Payments — Stripe</h2>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Coming soon
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A &ldquo;Connect with Stripe&rdquo; button is on the roadmap —
            Until then, invoices use PayPal (above) for payment collection.
          </p>
        </div>
      </header>
    </section>
  );
}
