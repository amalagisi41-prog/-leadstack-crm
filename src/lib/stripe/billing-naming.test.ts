import { beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { FALLBACK_LINE_ITEM_NAME, findAddOnItem, summarizeSubscription } from "./subscription-management";
import { addOnKeyForPrice, planKeyForPrice } from "./catalog";

beforeAll(() => {
  delete process.env.STRIPE_SOLO_PRICE_ID;
  delete process.env.STRIPE_ADDON_WEBSITE_STUDIO_PRICE_ID;
});

function item(id: string, price: Partial<Stripe.Price> & { id: string }, metadata: Record<string, string> = {}) {
  return { id, quantity: 1, metadata, current_period_end: 1_800_000_000, price } as unknown as Stripe.SubscriptionItem;
}

function sub(items: Stripe.SubscriptionItem[]) {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    discounts: [],
    items: { data: items },
  } as unknown as Stripe.Subscription;
}

const legacySolo = {
  id: "price_legacy_149",
  unit_amount: 14900,
  currency: "usd",
  recurring: { interval: "month", interval_count: 1 },
  nickname: null,
  lookup_key: null,
  metadata: {},
  product: { id: "prod_x", name: "AgentStack Solo", metadata: {} },
} as unknown as Stripe.Price;

describe("customer-visible line item names", () => {
  it("never says 'Other subscription item': an unmapped price is named from its Stripe product", () => {
    const s = summarizeSubscription(sub([item("si_1", legacySolo)]));
    expect(s.lineItems[0].name).toBe("AgentStack Solo");
    expect(s.lineItems[0].name).not.toMatch(/other subscription item/i);
    expect(s.currentPlanName).toBe("AgentStack Solo");
  });

  it("falls back to a product-neutral name, still never the generic one", () => {
    const bare = { ...legacySolo, product: "prod_unexpanded" } as unknown as Stripe.Price;
    const s = summarizeSubscription(sub([item("si_1", bare)]));
    expect(s.lineItems[0].name).toBe(FALLBACK_LINE_ITEM_NAME);
  });

  it("recognises a plan tagged by the setup script (metadata or product metadata) as AgentStack Solo", () => {
    const tagged = { ...legacySolo, metadata: { plan_key: "starter" } } as unknown as Stripe.Price;
    const s = summarizeSubscription(sub([item("si_1", tagged)]));
    expect(s.currentPlanKey).toBe("starter");
    expect(s.lineItems[0]).toMatchObject({ name: "AgentStack Solo", kind: "plan", recurringAmount: 14900 });
    expect(planKeyForPrice({ id: "p", product_metadata: { plan_key: "starter" } })).toBe("starter");
    expect(planKeyForPrice({ id: "p", lookup_key: "agentstack_solo_monthly" })).toBe("starter");
  });

  it("recognises add-on prices by the lookup keys the app creates, without env vars", () => {
    expect(addOnKeyForPrice({ id: "p", lookup_key: "agentstack_addon_website_studio_monthly" })).toBe("website_studio");
    const addOn = {
      id: "price_ws",
      unit_amount: 9900,
      currency: "usd",
      recurring: { interval: "month", interval_count: 1 },
      lookup_key: "agentstack_addon_website_studio_monthly",
      metadata: {},
      product: { id: "prod_ws", name: "AI Website Studio", metadata: {} },
    } as unknown as Stripe.Price;
    const s = sub([item("si_1", legacySolo), item("si_2", addOn, { subAccountId: "sa_A" })]);
    const summary = summarizeSubscription(s);
    expect(summary.lineItems[1]).toMatchObject({ name: "AI Website Studio", kind: "add_on", recurringAmount: 9900 });
    expect(findAddOnItem(s, "website_studio", "sa_A")?.id).toBe("si_2");
    expect(findAddOnItem(s, "website_studio", "sa_B")).toBeNull();
  });
});
