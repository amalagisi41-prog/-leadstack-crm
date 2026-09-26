"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, ReceiptText } from "lucide-react";
import { getMarketingPlan } from "@/config/landing";
import { ADD_ON_PRICE_ENV_VAR } from "@/lib/stripe/addon-catalog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type BillingSummary = {
  currentPlanKey: "starter" | "pro" | null;
  currentPlanName: string;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  activeAddOnKeys: Array<"idx" | "social" | "website_studio">;
  activeAddOnCount: number;
  bundleDiscountActive: boolean;
  bundleCouponConfigured: boolean;
  lineItems: Array<{
    id: string;
    name: string;
    kind: "plan" | "add_on" | "other";
    quantity: number;
    currency: string | null;
    unitAmount: number | null;
    recurringAmount: number | null;
    interval: "day" | "week" | "month" | "year" | null;
    intervalCount: number | null;
  }>;
  nextRecurringInvoice: {
    amount: number;
    currency: string;
  } | null;
};

type UnbilledAddOn = {
  subAccountId: string;
  subAccountName: string;
  addOnKey: "idx" | "social" | "website_studio";
  addOnName: string;
  reason: "missing_item" | "not_priced" | "no_subscription";
};

const PLAN_CHOICES = [
  { key: "starter" as const, name: getMarketingPlan("starter").name },
  { key: "pro" as const, name: getMarketingPlan("pro").name },
] as const;

const CANCEL_REASONS = [
  { key: "too_expensive", label: "Too expensive" },
  { key: "missing_features", label: "Missing something I need" },
  { key: "too_complex", label: "Too much to manage" },
  { key: "switched_service", label: "Switched to something else" },
  { key: "unused", label: "Not using it enough" },
  { key: "support", label: "Support issue" },
  { key: "other", label: "Other" },
] as const;

function formatDate(epochSeconds: number | null) {
  if (!epochSeconds) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(epochSeconds * 1000));
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function intervalLabel(
  interval: BillingSummary["lineItems"][number]["interval"],
  intervalCount: number | null,
) {
  if (!interval) return "recurring interval unavailable";
  const count = intervalCount ?? 1;
  if (count === 1) return `per ${interval}`;
  return `every ${count} ${interval}s`;
}

export function AgencyBillingSection({ detailed = false }: { detailed?: boolean }) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [unbilled, setUnbilled] = useState<UnbilledAddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<
    "portal" | "resume" | "cancel" | "starter" | "pro" | "bill_add_ons" | null
  >(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>("too_expensive");
  const [cancelDetail, setCancelDetail] = useState("");
  /**
   * Set by the last "Add to billing" click — what it could NOT fix, so the
   * toast never claims full success when a price is still missing. A ref,
   * not state: it's read synchronously right after the call resolves, before
   * a state update would have re-rendered.
   */
  const lastUnresolvedRef = useRef<UnbilledAddOn[]>([]);

  async function loadSummary() {
    setLoading(true);
    try {
      const res = await fetch("/api/agency/billing", {
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        summary?: BillingSummary;
        unbilledAddOns?: UnbilledAddOn[];
        error?: string;
      };
      if (!res.ok || !data.summary) {
        throw new Error(data.error ?? "Could not load billing.");
      }
      setSummary(data.summary);
      setUnbilled(data.unbilledAddOns ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load billing.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  const nextBillingLabel = useMemo(() => {
    if (!summary?.currentPeriodEnd) return "—";
    return summary.cancelAtPeriodEnd
      ? `Ends ${formatDate(summary.currentPeriodEnd)}`
      : `Renews ${formatDate(summary.currentPeriodEnd)}`;
  }, [summary]);

  async function runAction(body: object, busy: typeof busyAction) {
    setBusyAction(busy);
    try {
      const res = await fetch("/api/agency/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        summary?: BillingSummary;
        unbilledAddOns?: UnbilledAddOn[];
        unresolved?: UnbilledAddOn[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not update billing.");
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.summary) setSummary(data.summary);
      if (data.unbilledAddOns) setUnbilled(data.unbilledAddOns);
      lastUnresolvedRef.current = data.unresolved ?? [];
      return data.summary ?? null;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update billing.",
      );
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCancel() {
    const next = await runAction(
      {
        action: "cancel",
        reason: cancelReason,
        detail: cancelDetail,
      },
      "cancel",
    );
    if (next) {
      toast.success("Your plan will stay active through the end of the current billing period.");
      setCancelOpen(false);
      setCancelDetail("");
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CreditCard className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">
            {detailed ? "Current subscription" : "Billing"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Switch plans, manage your card, and cancel from inside AgentStack.
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {loading ? "Loading plan…" : summary?.currentPlanName ?? "No active plan"}
            </p>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Checking your current billing details."
                : summary?.subscriptionStatus
                  ? `${summary.subscriptionStatus.replaceAll("_", " ")} · ${nextBillingLabel}`
                  : "No subscription is connected yet."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runAction({ action: "portal" }, "portal")}
            disabled={loading || busyAction !== null}
          >
            {busyAction === "portal" ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Opening…
              </>
            ) : (
              <>
                <ReceiptText className="mr-1 h-3.5 w-3.5" />
                Billing details
              </>
            )}
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Next recurring charge</p>
              <p className="text-xs text-muted-foreground">
                Stripe preview including active discounts and applicable tax.
              </p>
            </div>
            <p className="text-lg font-semibold tabular-nums">
              {loading
                ? "Loading…"
                : summary?.nextRecurringInvoice
                  ? formatAmount(
                      summary.nextRecurringInvoice.amount,
                      summary.nextRecurringInvoice.currency,
                    )
                  : "Not available"}
            </p>
          </div>
          {!loading && !summary?.nextRecurringInvoice && summary?.subscriptionStatus && (
            <p className="mt-2 text-xs text-muted-foreground">
              Stripe could not return a recurring invoice preview for this subscription. Open Billing details to see Stripe&apos;s current invoice information.
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Plan and add-ons</p>
            {!loading && (
              <p className="text-xs text-muted-foreground">
                {summary?.lineItems.length ?? 0} billed item{(summary?.lineItems.length ?? 0) === 1 ? "" : "s"}
              </p>
            )}
          </div>
          {loading ? (
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          ) : summary?.lineItems.length ? (
            <ul className="divide-y rounded-lg border bg-background">
              {summary.lineItems.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.kind === "plan" ? "Plan" : item.kind === "add_on" ? "Add-on" : "Subscription item"}
                      {item.quantity > 1 ? ` · Quantity ${item.quantity}` : ""}
                      {" · "}{intervalLabel(item.interval, item.intervalCount)}
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    {item.recurringAmount !== null && item.currency
                      ? formatAmount(item.recurringAmount, item.currency)
                      : "Price unavailable"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
              No billed plan or add-ons are attached to this subscription yet.
            </p>
          )}
        </div>

        {!loading && unbilled.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {unbilled.length} active add-on{unbilled.length === 1 ? " is" : "s are"} not on this bill
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-900/90 dark:text-amber-200/90">
              {unbilled.map((u) => (
                <li key={`${u.subAccountId}:${u.addOnKey}`}>
                  {u.addOnName} · {u.subAccountName}
                  {u.reason === "not_priced"
                    ? ` — no Stripe price configured on this deployment. Create a recurring price in Stripe and set ${ADD_ON_PRICE_ENV_VAR[u.addOnKey]} in your environment variables, then click "Add to billing" again.`
                    : u.reason === "no_subscription"
                      ? " — no active subscription to attach this to"
                      : ""}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              className="mt-3"
              disabled={busyAction !== null}
              onClick={() =>
                void runAction({ action: "bill_add_ons" }, "bill_add_ons").then(
                  (next) => {
                    if (!next) return; // runAction already toasted the error
                    const unresolved = lastUnresolvedRef.current;
                    if (unresolved.length > 0) {
                      toast.warning(
                        `Billed what we could — ${unresolved.length} add-on${unresolved.length === 1 ? "" : "s"} still ${unresolved.length === 1 ? "needs" : "need"} a Stripe price configured.`,
                      );
                    } else {
                      toast.success("Billing updated for active add-ons.");
                    }
                  },
                )
              }
            >
              {busyAction === "bill_add_ons" ? "Updating…" : "Add to billing"}
            </Button>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {PLAN_CHOICES.map((plan) => {
            const selected = summary?.currentPlanKey === plan.key;
            return (
              <Button
                key={plan.key}
                type="button"
                variant={selected ? "default" : "outline"}
                className="justify-between"
                disabled={loading || busyAction !== null}
                onClick={() =>
                  void runAction(
                    { action: "switch_plan", planKey: plan.key },
                    plan.key,
                  )
                }
              >
                <span>{plan.name}</span>
                {busyAction === plan.key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : selected ? (
                  <span className="text-xs">Current</span>
                ) : (
                  <span className="text-xs">Switch</span>
                )}
              </Button>
            );
          })}
        </div>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {loading
            ? "Loading add-on bundle details…"
            : summary?.bundleDiscountActive
              ? "Bundle savings are active — 15% off because 3 or more add-ons are on your subscription."
              : summary?.bundleCouponConfigured
                ? `${Math.max(0, 3 - (summary?.activeAddOnCount ?? 0))} more add-on${Math.max(0, 3 - (summary?.activeAddOnCount ?? 0)) === 1 ? "" : "s"} unlocks 15% off automatically.`
                : "Bundle savings will turn on automatically once your billing coupon is configured."}
        </div>

        <div className="flex flex-wrap gap-2">
          {summary?.cancelAtPeriodEnd ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void runAction({ action: "resume" }, "resume")}
              disabled={loading || busyAction !== null}
            >
              {busyAction === "resume" ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Keeping plan…
                </>
              ) : (
                "Keep my plan"
              )}
            </Button>
          ) : (
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <DialogTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                  />
                }
              >
                Cancel plan
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Cancel at period end</DialogTitle>
                  <DialogDescription>
                    We&apos;ll keep your workspace active through your current billing period and save your reason with the request.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>What&apos;s the main reason?</Label>
                    <div className="grid gap-2">
                      {CANCEL_REASONS.map((reason) => (
                        <button
                          key={reason.key}
                          type="button"
                          onClick={() => setCancelReason(reason.key)}
                          className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            cancelReason === reason.key
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {reason.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cancel-detail">Anything we should know? (optional)</Label>
                    <Textarea
                      id="cancel-detail"
                      value={cancelDetail}
                      onChange={(e) => setCancelDetail(e.target.value)}
                      placeholder="What pushed you to cancel, or what would have made this easier to keep?"
                      rows={4}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelOpen(false)}
                    disabled={busyAction === "cancel"}
                  >
                    Keep plan
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleCancel()}
                    disabled={busyAction === "cancel"}
                  >
                    {busyAction === "cancel" ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        Cancelling…
                      </>
                    ) : (
                      "Confirm cancellation"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </section>
  );
}
