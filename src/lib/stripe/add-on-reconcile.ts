import "server-only";

import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AgencyDoc } from "@/types";
import {
  ADD_ON_GATE_FIELD,
  ADD_ON_KEYS,
  resolveAddOnPriceId,
  type AddOnKey,
} from "@/lib/stripe/catalog";
import { ADD_ON_LABELS } from "@/lib/stripe/addon-catalog";
import { itemAddOnKey } from "@/lib/stripe/subscription-management";
import { syncAddOnSubscriptionItem } from "@/lib/stripe/add-on-sync";

/**
 * A paid add-on that is switched ON for a sub-account but has no matching
 * line on the agency's Stripe subscription. The billing screen lists these
 * instead of silently showing a shorter invoice.
 */
export interface UnbilledAddOn {
  subAccountId: string;
  subAccountName: string;
  addOnKey: AddOnKey;
  addOnName: string;
  /** "missing_item" is fixable in-app; "not_priced" needs the env price id. */
  reason: "missing_item" | "not_priced" | "no_subscription";
}

export async function findUnbilledAddOns(
  agencyId: string,
  subscription: Stripe.Subscription | null,
): Promise<UnbilledAddOn[]> {
  const snap = await getAdminDb()
    .collection("subAccounts")
    .where("agencyId", "==", agencyId)
    .get();

  // Items tagged to a sub-account cover exactly that sub-account; untagged
  // legacy items each cover one (quantity-aware) gated sub-account.
  const tagged = new Set<string>();
  const legacyRemaining = new Map<AddOnKey, number>();
  for (const item of subscription?.items.data ?? []) {
    const key = itemAddOnKey(item);
    if (!key) continue;
    const owner = item.metadata?.subAccountId;
    if (owner) tagged.add(`${key}:${owner}`);
    else legacyRemaining.set(key, (legacyRemaining.get(key) ?? 0) + (item.quantity ?? 1));
  }

  const priced = Object.fromEntries(
    await Promise.all(ADD_ON_KEYS.map(async (k) => [k, !!(await resolveAddOnPriceId(k))] as const)),
  ) as Record<AddOnKey, boolean>;

  const unbilled: UnbilledAddOn[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    for (const key of ADD_ON_KEYS) {
      if (data[ADD_ON_GATE_FIELD[key]] !== true) continue;
      if (tagged.has(`${key}:${doc.id}`)) continue;
      const legacy = legacyRemaining.get(key) ?? 0;
      if (legacy > 0) {
        legacyRemaining.set(key, legacy - 1);
        continue;
      }
      unbilled.push({
        subAccountId: doc.id,
        subAccountName: typeof data.name === "string" ? data.name : doc.id,
        addOnKey: key,
        addOnName: ADD_ON_LABELS[key].name,
        reason: !priced[key]
          ? "not_priced"
          : !subscription
            ? "no_subscription"
            : "missing_item",
      });
    }
  }
  return unbilled;
}

export interface AttachedAddOn {
  subAccountId: string;
  subAccountName: string;
  addOnKey: AddOnKey;
  addOnName: string;
}

/**
 * Put every active-but-unbilled add-on on the subscription. Catch-up items
 * are created WITHOUT proration: they bill from the next cycle on, and time
 * that already went unbilled is never charged retroactively.
 *
 * Returns what was attached and what still could not be (no price in Stripe,
 * or no subscription); the latter are logged for operators, never shown to
 * the customer as instructions.
 */
export async function billUnbilledAddOns(
  agency: AgencyDoc,
  agencyId: string,
  subscription: Stripe.Subscription | null,
): Promise<{ attached: AttachedAddOn[]; unresolved: UnbilledAddOn[] }> {
  const pending = await findUnbilledAddOns(agencyId, subscription);
  const attached: AttachedAddOn[] = [];
  for (const entry of pending) {
    if (entry.reason !== "missing_item") continue;
    const result = await syncAddOnSubscriptionItem({
      agency,
      subAccountId: entry.subAccountId,
      addOnKey: entry.addOnKey,
      enabled: true,
      prorate: false,
    });
    if (result.outcome === "added") {
      const { reason: _reason, ...rest } = entry;
      void _reason;
      attached.push(rest);
    }
  }
  const unresolved = pending.filter((p) => p.reason !== "missing_item");
  for (const u of unresolved) {
    console.error(
      `[billing-config] Add-on "${u.addOnKey}" is active on sub-account ${u.subAccountId} (agency ${agencyId}) but cannot be billed: ${u.reason}.`,
    );
  }
  if (attached.length > 0) {
    console.info(
      `[billing] Attached ${attached.length} active add-on(s) for agency ${agencyId}, billing from the next cycle (no proration): ` +
        attached.map((a) => `${a.addOnKey}@${a.subAccountId}`).join(", "),
    );
  }
  return { attached, unresolved };
}
