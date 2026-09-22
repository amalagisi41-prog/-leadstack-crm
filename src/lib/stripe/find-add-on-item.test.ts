import { beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { findAddOnItem } from "./subscription-management";
import { addOnKeyForPrice, planKeyForPrice } from "./catalog";

beforeAll(() => {
  process.env.STRIPE_ADDON_IDX_PRICE_ID = "price_idx\n";
  process.env.STRIPE_SOLO_PRICE_ID = " price_solo ";
});

function sub(items: Array<{ id: string; price: string; subAccountId?: string }>) {
  return {
    items: {
      data: items.map((i) => ({
        id: i.id,
        price: { id: i.price },
        metadata: i.subAccountId ? { subAccountId: i.subAccountId } : {},
      })),
    },
  } as unknown as Stripe.Subscription;
}

describe("findAddOnItem", () => {
  it("does not let another sub-account's IDX line count as this one's", () => {
    const s = sub([{ id: "si_a", price: "price_idx", subAccountId: "sa_A" }]);
    expect(findAddOnItem(s, "idx", "sa_B")).toBeNull();
  });

  it("finds this sub-account's own line", () => {
    const s = sub([
      { id: "si_a", price: "price_idx", subAccountId: "sa_A" },
      { id: "si_b", price: "price_idx", subAccountId: "sa_B" },
    ]);
    expect(findAddOnItem(s, "idx", "sa_B")?.id).toBe("si_b");
  });

  it("still accepts an untagged legacy line", () => {
    const s = sub([{ id: "si_legacy", price: "price_idx" }]);
    expect(findAddOnItem(s, "idx", "sa_B")?.id).toBe("si_legacy");
  });
});

describe("price recognition", () => {
  it("tolerates whitespace in env price ids", () => {
    expect(addOnKeyForPrice({ id: "price_idx" })).toBe("idx");
    expect(planKeyForPrice({ id: "price_solo" })).toBe("starter");
  });

  it("falls back to Stripe price metadata / lookup keys", () => {
    expect(planKeyForPrice({ id: "price_other", metadata: { plan_key: "solo" } })).toBe("starter");
    expect(addOnKeyForPrice({ id: "price_other", lookup_key: "idx" })).toBe("idx");
    expect(planKeyForPrice({ id: "price_other" })).toBeNull();
  });
});
