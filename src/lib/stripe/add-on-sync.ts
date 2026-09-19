import "server-only";

import type { AgencyDoc } from "@/types";
import {
  ADD_ON_GATE_FIELD,
  ADD_ON_KEYS,
  addOnPriceId,
  type AddOnKey,
} from "@/lib/stripe/catalog";
import { getStripeServer } from "@/lib/stripe/server";
import {
  findAddOnItem,
  retrieveAgencySubscription,
  syncBundleDiscount,
} from "@/lib/stripe/subscription-management";

/**
 * Keep an agency's Stripe subscription in step with a sub-account's paid
 * feature gates.
 *
 * Three gates cost money — IDX, Social Planner, AI Website Studio — and the
 * gate field on the sub-account document is what unlocks the feature. Two
 * different screens write those fields: Settings → Add-ons, and the agency's
 * Manage dialog. Only the first ever created the Stripe subscription item, so
 * an agency owner turning IDX on from the Manage dialog — the obvious place —
 * got the feature with no line on the invoice.
 *
 * This is the one place that reconciles the two, so neither screen can drift
 * from the other again. Both routes call it; neither talks to Stripe directly.
 */

/** Which paid add-on a gate field belongs to, if any. */
export function addOnKeyForGateField(gateField: string): AddOnKey | null {
  for (const key of ADD_ON_KEYS) {
    if (ADD_ON_GATE_FIELD[key] === gateField) return key;
  }
  return null;
}

export type AddOnSyncOutcome =
  /** A subscription item was created. The agency is now billed for it. */
  | "added"
  /** The subscription item was removed. Billing stops at the period end. */
  | "removed"
  /** Stripe already matched the requested state; nothing to do. */
  | "already"
  /**
   * This deployment has no price configured for the add-on, so there is
   * nothing to bill. Self-hosted buyers who never set up paid add-ons live
   * here permanently, and the gate must still work for them.
   */
  | "not_priced"
  /**
   * The agency has no Stripe subscription to attach an item to. The gate
   * still flips — refusing would strand a workspace mid-setup — but the
   * caller MUST surface this rather than reporting plain success, or it
   * recreates the silent-unbilled bug in a new place.
   */
  | "no_subscription";

export interface AddOnSyncResult {
  addOnKey: AddOnKey;
  gateField: string;
  enabled: boolean;
  outcome: AddOnSyncOutcome;
}

/** True when the caller should tell someone the feature is on but unbilled. */
export function isUnbilled(result: AddOnSyncResult): boolean {
  return (
    result.enabled &&
    (result.outcome === "no_subscription" || result.outcome === "not_priced")
  );
}

/**
 * Add or remove the subscription item backing one paid gate.
 *
 * Never throws on a missing price or missing subscription — those are
 * configuration states, not errors, and blocking a feature toggle on them
 * would be worse than proceeding and saying so. A genuine Stripe failure does
 * throw, because silently swallowing it is how an agency ends up giving a
 * paid feature away.
 */
export async function syncAddOnSubscriptionItem(params: {
  agency: Pick<AgencyDoc, "subscriptionId"> | null | undefined;
  subAccountId: string;
  addOnKey: AddOnKey;
  enabled: boolean;
}): Promise<AddOnSyncResult> {
  const { agency, subAccountId, addOnKey, enabled } = params;
  const gateField = ADD_ON_GATE_FIELD[addOnKey];
  const base = { addOnKey, gateField, enabled };

  const priceId = addOnPriceId(addOnKey);
  if (!priceId) return { ...base, outcome: "not_priced" };
  if (!agency?.subscriptionId) return { ...base, outcome: "no_subscription" };

  const stripe = getStripeServer();
  const subscription = await retrieveAgencySubscription(agency as AgencyDoc);
  const existing = subscription
    ? findAddOnItem(subscription, addOnKey, subAccountId)
    : null;

  if (enabled) {
    // Scoped by subAccountId in metadata, so two sub-accounts on the same
    // agency each carry their own line rather than sharing one.
    if (existing) return { ...base, outcome: "already" };
    await stripe.subscriptionItems.create({
      subscription: agency.subscriptionId,
      price: priceId,
      quantity: 1,
      metadata: { addOnKey, subAccountId },
    });
    await syncBundleDiscount(agency.subscriptionId);
    return { ...base, outcome: "added" };
  }

  if (!existing) return { ...base, outcome: "already" };
  await stripe.subscriptionItems.del(existing.id);
  await syncBundleDiscount(agency.subscriptionId);
  return { ...base, outcome: "removed" };
}
