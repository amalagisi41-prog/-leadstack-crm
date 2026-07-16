import "server-only";

import type Stripe from "stripe";
import { getMarketingPlan } from "@/config/landing";
import type { AgencyDoc } from "@/types";
import {
  ADD_ON_KEYS,
  addOnKeyForPriceId,
  addOnPriceId,
  planKeyForPriceId,
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
    };
  }

  const basePlan = findBasePlanItem(subscription);
  const currentPlanKey = basePlan?.planKey ?? null;
  const addOnKeys: AddOnKey[] = [];
  let activeAddOnCount = 0;

  for (const item of subscription.items.data) {
    const priceId =
      typeof item.price === "string" ? item.price : item.price?.id ?? null;
    if (!priceId) continue;
    const addOnKey = addOnKeyForPriceId(priceId);
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
  };
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
    const priceId =
      typeof item.price === "string" ? item.price : item.price?.id ?? null;
    if (!priceId) continue;
    const planKey = planKeyForPriceId(priceId);
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
