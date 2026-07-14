"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import {
  ADD_ON_GATE_FIELD,
  ADD_ON_KEYS,
  ADD_ON_LABELS,
  type AddOnKey,
} from "@/lib/stripe/addon-catalog";

/**
 * Lets an already-subscribed agency owner add one of the 3 real-gate
 * add-ons (IDX, Social Planner, AI Website Studio) to THIS sub-account
 * without leaving the dashboard. Calls
 * `/api/sub-accounts/[id]/add-ons/purchase`, which extends the agency's
 * live Stripe subscription directly (a Subscription Item, not a second
 * Checkout Session) and flips the gate immediately on success — see "Real
 * self-serve billing".
 *
 * Purchasing requires being the agency owner (the route enforces this
 * server-side); sub-account admins who aren't the owner still see the
 * list (so they know what's available and who to ask) but the buttons are
 * replaced with a note instead of failing silently on click.
 */
export function SubAccountAddOnsSection() {
  const { agencyRole } = useAuth();
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [purchasing, setPurchasing] = useState<AddOnKey | null>(null);

  if (!isAdmin || !subAccount) return null;
  const isOwner = agencyRole === "owner";

  async function handlePurchase(key: AddOnKey) {
    setPurchasing(key);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/add-ons/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addOnKey: key }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not add this add-on.");
      }
      toast.success(`${ADD_ON_LABELS[key].name} is now active.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add this add-on.");
    } finally {
      setPurchasing(null);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Add-ons</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Layer these onto your subscription any time — billed on your
            existing card, no separate checkout.
          </p>
        </div>
      </header>

      <ul className="space-y-2.5">
        {ADD_ON_KEYS.map((key) => {
          const label = ADD_ON_LABELS[key];
          const gateField = ADD_ON_GATE_FIELD[key];
          const active = (subAccount as unknown as Record<string, unknown>)[gateField] === true;
          return (
            <li
              key={key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{label.name}</p>
                <p className="text-xs text-muted-foreground">{label.price}</p>
              </div>
              {active ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Active
                </span>
              ) : isOwner ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handlePurchase(key)}
                  disabled={purchasing !== null}
                >
                  {purchasing === key ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Adding…
                    </>
                  ) : (
                    "Add to my plan"
                  )}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Ask your agency owner to add this
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
