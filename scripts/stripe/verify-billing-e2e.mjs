#!/usr/bin/env node
/**
 * TEST MODE ONLY. End-to-end check that a subscription with one add-on
 * produces an invoice whose line items are all named and correctly priced.
 *
 *   node scripts/stripe/verify-billing-e2e.mjs
 *
 * Needs STRIPE_SECRET_KEY = an sk_test_ key, and the catalog from
 * setup-billing-catalog.mjs --apply. Creates its own Solo test price (only in
 * test mode, if none exists), a throwaway customer with Stripe's test card, a
 * Solo + AI Website Studio subscription, prints the first invoice's lines, and
 * cancels the subscription afterwards.
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
if (!key.includes("_test_")) {
  console.error("Refusing to run: STRIPE_SECRET_KEY must be a TEST key.");
  process.exit(1);
}
const stripe = new Stripe(key);
// The key may be injected by a proxy, so ask Stripe itself which mode it is.
if ((await stripe.balance.retrieve()).livemode) {
  console.error("Refusing to run: this Stripe key is LIVE. Use a test key.");
  process.exit(1);
}

const SOLO = { name: "AgentStack Solo", cents: 9900, lookup: "agentstack_solo_monthly" };
const ADDON = { name: "AI Website Studio", cents: 9900, lookup: "agentstack_addon_website_studio_monthly", key: "website_studio" };

async function priceByLookup(lookup) {
  const r = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1, expand: ["data.product"] });
  return r.data[0] ?? null;
}

let solo = await priceByLookup(SOLO.lookup);
if (!solo) {
  const product = await stripe.products.create({ name: SOLO.name, description: `${SOLO.name} plan`, metadata: { plan_key: "starter" } });
  solo = await stripe.prices.create({
    product: product.id, currency: "usd", unit_amount: SOLO.cents, recurring: { interval: "month" },
    lookup_key: SOLO.lookup, nickname: SOLO.name, metadata: { plan_key: "starter" },
  });
}
const addOn = await priceByLookup(ADDON.lookup);
if (!addOn) {
  console.error("AI Website Studio price not found — run setup-billing-catalog.mjs --apply first.");
  process.exit(1);
}

const customer = await stripe.customers.create({
  email: "billing-e2e@example.com",
  name: "Billing E2E (test)",
  payment_method: "pm_card_visa",
  invoice_settings: { default_payment_method: "pm_card_visa" },
});
const sub = await stripe.subscriptions.create({
  customer: customer.id,
  items: [
    { price: solo.id, quantity: 1 },
    { price: addOn.id, quantity: 1, metadata: { addOnKey: ADDON.key, subAccountId: "sa_e2e_test" } },
  ],
  expand: ["latest_invoice"],
});
const invoice = await stripe.invoices.retrieve(
  typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice.id,
);
const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 20 });

const expected = new Map([[SOLO.name, SOLO.cents], [ADDON.name, ADDON.cents]]);
const rows = lines.data.map((l) => ({ description: l.description, amount: l.amount, currency: l.currency }));
const problems = [];
for (const r of rows) {
  const match = [...expected.keys()].find((n) => r.description?.includes(n));
  if (!match) problems.push(`unnamed/unknown line: ${r.description}`);
  else if (r.amount !== expected.get(match)) problems.push(`${match} billed ${r.amount}, expected ${expected.get(match)}`);
  if (/other subscription item/i.test(r.description ?? "")) problems.push(`generic name: ${r.description}`);
}
for (const n of expected.keys()) if (!rows.some((r) => r.description?.includes(n))) problems.push(`missing line: ${n}`);

await stripe.subscriptions.cancel(sub.id);

console.log(JSON.stringify({
  invoice: invoice.id,
  status: invoice.status,
  total: invoice.total,
  currency: invoice.currency,
  lines: rows,
  result: problems.length ? "FAIL" : "PASS",
  problems,
  cleanup: `subscription ${sub.id} cancelled; customer ${customer.id} left in test mode`,
}, null, 2));
process.exit(problems.length ? 1 : 0);
