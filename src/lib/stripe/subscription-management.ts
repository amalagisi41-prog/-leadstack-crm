import "server-only";

import type Stripe from "stripe";
import { getMarketingPlan } from "@/config/landing";
import type { AgencyDoc } from "@/types";
import {
  ADD_ON_KEYS,
  addOnKeyForPrice,
  addOnPriceId,
  planKeyForPrice,
  type AddOnKey,
  type PlanKey,
} from "@/lib/stripe/catalog";
import { getStripeServer } from "@/lib/stripe/server";

export interface BillingSnapshot {
  currentPlanKey: PlanKey | null;
  currentPlanName: string;
  subscriptionStatus: Stripe.Subscription.Status | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  activeAddOnKeys: AddOnKey[];
  activeAddOnCount: number;
  bundleDiscountActive: boolean;
  bundleCouponConfigured: boolean;
  lineItems: BillingLineItem[];
  nextRecurringInvoice: NextRecurringInvoice | null;
}

export interface BillingLineItem {
  id: string;
  name: string;
  kind: "plan" | "add_on" | "other";
  quantity: number;
  currency: string | null;
  unitAmount: number | null;
  recurringAmount: number | null;
  interval: "day" | "week" | "month" | "year" | null;
  intervalCount: number | null;
}

export interface NextRecurringInvoice {
  amount: number;
  currency: string;
}

const SUBSCRIPTION_EXPANDS = ["discounts", "items.data.price"] as const;

export function getBundleCouponId(): string | null {
  return process.env.STRIPE_ADDON_BUNDLE_COUPON_ID?.trim() || null;
}

export async function retrieveAgencySubscription(agency: AgencyDoc) {
  if (!agency.subscriptionId) return null;
  const stripe = getStripeServer();
  return stripe.subscriptions.retrieve(agency.subscriptionId, {
    expand: [...SUBSCRIPTION_EXPANDS],
  });
}

export function summarizeSubscription(
  subscription: Stripe.Subscription | null,
): BillingSnapshot {
  const bundleCouponId = getBundleCouponId();
  if (!subscription) {
    return {
      currentPlanKey: null,
      currentPlanName: "No active plan",
      subscriptionStatus: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      activeAddOnKeys: [],
      activeAddOnCount: 0,
      bundleDiscountActive: false,
      bundleCouponConfigured: !!bundleCouponId,
      lineItems: [],
      nextRecurringInvoice: null,
    };
  }

  const basePlan = findBasePlanItem(subscription);
  const currentPlanKey = basePlan?.planKey ?? null;
  const addOnKeys: AddOnKey[] = [];
  let activeAddOnCount = 0;

  for (const item of subscription.items.data) {
    const addOnKey = itemAddOnKey(item);
    if (!addOnKey) continue;
    activeAddOnCount += item.quantity ?? 1;
    if (!addOnKeys.includes(addOnKey)) addOnKeys.push(addOnKey);
  }

  const currentPeriodEnd = subscription.items.data.reduce<number | null>(
    (latest, item) => {
      const next = item.current_period_end ?? null;
      if (!next) return latest;
      return latest ? Math.max(latest, next) : next;
    },
    null,
  );

  return {
    currentPlanKey,
    currentPlanName: currentPlanKey
      ? getMarketingPlan(currentPlanKey).name
      : "Managed plan",
    subscriptionStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd,
    activeAddOnKeys: addOnKeys,
    activeAddOnCount,
    bundleDiscountActive: hasBundleDiscount(subscription, bundleCouponId),
    bundleCouponConfigured: !!bundleCouponId,
    lineItems: subscription.items.data.map((item) => summarizeLineItem(item)),
    nextRecurringInvoice: null,
  };
}

/**
 * Stripe's invoice preview is the only reliable total when coupons, tax, or
 * account credits are involved. The subscription's price items are still
 * returned when a preview cannot be generated, but we deliberately leave the
 * total blank rather than manufacture a charge from list prices.
 */
export async function summarizeAgencyBilling(
  subscription: Stripe.Subscription | null,
): Promise<BillingSnapshot> {
  const summary = summarizeSubscription(subscription);
  if (!subscription) return summary;

  try {
    const preview = await getStripeServer().invoices.createPreview({
      subscription: subscription.id,
      preview_mode: "recurring",
    });
    if (typeof preview.total !== "number" || !preview.currency) return summary;
    return {
      ...summary,
      nextRecurringInvoice: {
        amount: preview.total,
        currency: preview.currency,
      },
    };
  } catch (error) {
    // A preview can be unavailable for an incomplete or legacy subscription.
    // Itemized subscription prices remain useful, and the UI tells the owner
    // exactly where to see Stripe's authoritative invoice total.
    console.warn("[billing] Could not preview the next recurring invoice", error);
    return summary;
  }
}

export async function syncBundleDiscount(subscriptionId: string) {
  const stripe = getStripeServer();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: [...SUBSCRIPTION_EXPANDS],
  });
  const bundleCouponId = getBundleCouponId();
  const summary = summarizeSubscription(subscription);

  if (!bundleCouponId) return summary;

  if (summary.activeAddOnCount >= 3 && !summary.bundleDiscountActive) {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      discounts: [{ coupon: bundleCouponId }],
      expand: [...SUBSCRIPTION_EXPANDS],
    });
    return summarizeSubscription(updated);
  }

  if (summary.activeAddOnCount < 3 && summary.bundleDiscountActive) {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      discounts: [],
      expand: [...SUBSCRIPTION_EXPANDS],
    });
    return summarizeSubscription(updated);
  }

  return summary;
}

export function findBasePlanItem(subscription: Stripe.Subscription) {
  for (const item of subscription.items.data) {
    const planKey = itemPlanKey(item);
    if (planKey) return { item, planKey };
  }
  return null;
}

export function findAddOnItem(
  subscription: Stripe.Subscription,
  addOnKey: AddOnKey,
  subAccountId?: string,
) {
  const priceId = addOnPriceId(addOnKey);
  if (!priceId) return null;

  if (subAccountId) {
    const exact = subscription.items.data.find(
      (item) =>
        (typeof item.price === "string" ? item.price : item.price?.id) ===
          priceId && item.metadata?.subAccountId === subAccountId,
    );
    if (exact) return exact;
    // Only a legacy item with NO sub-account tag may stand in for this one.
    // Falling back to ANY item with the price meant a second sub-account
    // turning IDX on matched the first one's line, reported "already", and
    // was never billed.
    return (
      subscription.items.data.find(
        (item) =>
          (typeof item.price === "string" ? item.price : item.price?.id) ===
            priceId && !item.metadata?.subAccountId,
      ) ?? null
    );
  }

  return (
    subscription.items.data.find(
      (item) =>
        (typeof item.price === "string" ? item.price : item.price?.id) ===
        priceId,
    ) ?? null
  );
}

export function getBundleDiscountMessage(summary: BillingSnapshot): string {
  if (!summary.bundleCouponConfigured) {
    return "Bundle savings will turn on automatically when your billing coupon is configured.";
  }
  if (summary.bundleDiscountActive) {
    return "Bundle savings are active — 15% off because 3 or more add-ons are on your subscription.";
  }
  const remaining = Math.max(0, 3 - summary.activeAddOnCount);
  return remaining === 0
    ? "Bundle savings will apply automatically on your next billing refresh."
    : `${remaining} more add-on${remaining === 1 ? "" : "s"} unlocks 15% off automatically.`;
}

export function configuredAddOnKeys(): AddOnKey[] {
  return ADD_ON_KEYS.filter((key) => !!addOnPriceId(key));
}

function hasBundleDiscount(
  subscription: Stripe.Subscription,
  bundleCouponId: string | null,
) {
  if (!bundleCouponId) return false;
  return subscription.discounts.some((discount) => {
    if (typeof discount === "string") return false;
    const coupon = discount.source?.coupon;
    if (!coupon) return false;
    return (typeof coupon === "string" ? coupon : coupon.id) === bundleCouponId;
  });
}

function summarizeLineItem(item: Stripe.SubscriptionItem): BillingLineItem {
  const price = typeof item.price === "string" ? null : item.price;
  const planKey = itemPlanKey(item);
  const addOnKey = itemAddOnKey(item);
  const quantity = item.quantity ?? 1;
  const unitAmount = price?.unit_amount ?? null;

  return {
    id: item.id,
    name: planKey
      ? getMarketingPlan(planKey).name
      : addOnKey
        ? addOnName(addOnKey)
        : price?.nickname?.trim() || "Other subscription item",
    kind: planKey ? "plan" : addOnKey ? "add_on" : "other",
    quantity,
    currency: price?.currency ?? null,
    unitAmount,
    recurringAmount: unitAmount === null ? null : unitAmount * quantity,
    interval: price?.recurring?.interval ?? null,
    intervalCount: price?.recurring?.interval_count ?? null,
  };
}

function addOnName(key: AddOnKey) {
  switch (key) {
    case "idx":
      return "IDX Core";
    case "social":
      return "Social Planner";
    case "website_studio":
      return "AI Website Studio";
  }
}

function priceShape(item: Stripe.SubscriptionItem) {
  if (typeof item.price === "string") return { id: item.price };
  if (!item.price) return null;
  return {
    id: item.price.id,
    lookup_key: item.price.lookup_key,
    metadata: item.price.metadata,
  };
}

export function itemPlanKey(item: Stripe.SubscriptionItem): PlanKey | null {
  const price = priceShape(item);
  return price ? planKeyForPrice(price) : null;
}

export function itemAddOnKey(item: Stripe.SubscriptionItem): AddOnKey | null {
  const price = priceShape(item);
  return price ? addOnKeyForPrice(price) : null;
}
