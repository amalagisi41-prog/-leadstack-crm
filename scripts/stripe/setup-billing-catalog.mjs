#!/usr/bin/env node
/**
 * Billing catalog setup + audit for an AgentStack deployment's Stripe account.
 *
 *   node scripts/stripe/setup-billing-catalog.mjs            # dry run: report only
 *   node scripts/stripe/setup-billing-catalog.mjs --apply    # create/tag (idempotent)
 *   node scripts/stripe/setup-billing-catalog.mjs --apply --attach
 *        # also put active-but-unbilled add-ons on agency subscriptions
 *        # (needs FIREBASE_ADMIN_* to read which sub-accounts have them on)
 *   --legacy-plan price_123=starter   tag a legacy-priced plan price with its
 *        plan name ONLY (metadata/nickname/product name — its amount, and every
 *        subscriber on it, stay exactly as they are). Repeatable.
 *
 * Reads STRIPE_SECRET_KEY (test or live) from the environment or .env.local.
 *
 * What --apply does, all idempotent and found again by lookup key:
 *  1. Add-ons: a product + monthly USD price per add-on, at the prices the app
 *     displays (IDX Core $60, Social Planner $29, AI Website Studio $99), with
 *     lookup keys the app resolves at runtime — no env var needed. An existing
 *     price with the right lookup key is left alone (a differing amount is
 *     reported, never changed).
 *  2. Plans: a plan price whose amount matches the CURRENT public price is
 *     named ("AgentStack Solo" / "Team") on its nickname, metadata and product,
 *     so the billing page and invoices name it. Prices that differ from the
 *     public price are LISTED as legacy and not touched unless --legacy-plan
 *     names them, and even then only their labels change.
 *  3. --attach: for every agency subscription, each add-on switched on for a
 *     sub-account but missing from the subscription gets a subscription item
 *     with proration_behavior "none": it bills from the next cycle and nothing
 *     already unbilled is charged.
 *
 * Never changes an existing price amount, a subscriber's plan, or back-bills.
 */
import { readFileSync, existsSync } from "node:fs";
import Stripe from "stripe";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ATTACH = args.includes("--attach");
const legacyTags = new Map();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--legacy-plan" && args[i + 1]) {
    const [price, plan] = args[i + 1].split("=");
    legacyTags.set(price, plan);
  }
}

function loadEnv() {
  const env = { ...process.env };
  const file = new URL("../../.env.local", import.meta.url);
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || env[m[1]]) continue;
      let v = m[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  return env;
}

const env = loadEnv();
const key = env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}
const stripe = new Stripe(key);
// Ask Stripe which mode the key is in (it may be injected by a proxy).
const MODE = (await stripe.balance.retrieve()).livemode ? "LIVE" : "TEST";

// Mirrors src/lib/stripe/addon-catalog.ts and src/config/landing.ts /
// src/lib/public-site/offer.ts — keep in step.
export const ADD_ONS = [
  { key: "idx", name: "IDX Core", cents: 6000, lookup: "agentstack_addon_idx_monthly", gate: "idxEnabledByAgency" },
  { key: "social", name: "Social Planner", cents: 2900, lookup: "agentstack_addon_social_monthly", gate: "socialPlannerEnabledByAgency" },
  { key: "website_studio", name: "AI Website Studio", cents: 9900, lookup: "agentstack_addon_website_studio_monthly", gate: "websiteStudioEnabledByAgency" },
];
export const PLANS = [
  { key: "starter", name: "AgentStack Solo", monthlyCents: 9900, lookup: "agentstack_solo_monthly" },
  { key: "pro", name: "Team", monthlyCents: 29900, lookup: "agentstack_team_monthly" },
];

const report = { mode: MODE, applied: APPLY, addOns: [], plans: [], legacyPlanPrices: [], attached: [], notes: [] };
const fmt = (c, cur = "usd") => `${(c / 100).toFixed(2)} ${cur.toUpperCase()}`;

// ---- 1. Add-on prices -------------------------------------------------------
const addOnPrice = {};
for (const a of ADD_ONS) {
  const found = await stripe.prices.list({ lookup_keys: [a.lookup], active: true, limit: 1 });
  let price = found.data[0];
  if (price) {
    const ok = price.unit_amount === a.cents && price.recurring?.interval === "month";
    report.addOns.push({ addOn: a.name, price: price.id, amount: fmt(price.unit_amount ?? 0, price.currency), status: ok ? "exists" : "exists — AMOUNT DIFFERS (not changed)" });
  } else if (APPLY) {
    const product = await stripe.products.create({
      name: a.name,
      description: `AgentStack add-on: ${a.name} (per sub-account, billed monthly)`,
      metadata: { addon_key: a.key },
    });
    price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: a.cents,
      recurring: { interval: "month" },
      lookup_key: a.lookup,
      nickname: a.name,
      metadata: { addon_key: a.key },
    });
    report.addOns.push({ addOn: a.name, price: price.id, amount: fmt(a.cents), status: "created" });
  } else {
    report.addOns.push({ addOn: a.name, price: null, amount: fmt(a.cents), status: "missing — would create" });
  }
  if (price) addOnPrice[a.key] = price.id;
}
const addOnByPrice = new Map(Object.entries(addOnPrice).map(([k, id]) => [id, k]));

// ---- 2. Plan prices, found on live subscriptions ---------------------------
const subs = [];
for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.items.data.price.product"] })) {
  if (["canceled", "incomplete_expired"].includes(sub.status)) continue;
  subs.push(sub);
}

function isAddOnPrice(price) {
  return (
    addOnByPrice.has(price.id) ||
    ADD_ONS.some((a) => a.key === price.metadata?.addon_key || a.lookup === price.lookup_key)
  );
}

const planPrices = new Map(); // price id -> { price, subscriptions: [] }
for (const sub of subs) {
  for (const item of sub.items.data) {
    if (isAddOnPrice(item.price)) continue;
    const entry = planPrices.get(item.price.id) ?? { price: item.price, subscriptions: [] };
    entry.subscriptions.push(`${sub.id} (${sub.status}, customer ${sub.customer})`);
    planPrices.set(item.price.id, entry);
  }
}

async function nameAsPlan(price, plan, { legacy }) {
  const product = typeof price.product === "string" ? await stripe.products.retrieve(price.product) : price.product;
  const changes = [];
  if (price.metadata?.plan_key !== plan.key || price.nickname !== plan.name) changes.push("price nickname/metadata");
  if (!legacy && price.lookup_key !== plan.lookup) changes.push("price lookup key");
  if (product.name !== plan.name || product.metadata?.plan_key !== plan.key) changes.push("product name/metadata");
  if (APPLY && changes.length) {
    await stripe.prices.update(price.id, {
      nickname: plan.name,
      metadata: { ...price.metadata, plan_key: plan.key, ...(legacy ? { legacy_pricing: "true" } : {}) },
      ...(!legacy ? { lookup_key: plan.lookup, transfer_lookup_key: true } : {}),
    });
    await stripe.products.update(product.id, {
      name: plan.name,
      description: `${plan.name} plan`,
      metadata: { ...product.metadata, plan_key: plan.key },
    });
  }
  return changes;
}

for (const [priceId, { price, subscriptions }] of planPrices) {
  const monthly = price.recurring?.interval === "month" && (price.recurring?.interval_count ?? 1) === 1;
  const current = monthly ? PLANS.find((p) => p.monthlyCents === price.unit_amount) : null;
  const productName = typeof price.product === "string" ? price.product : price.product?.name;
  if (current) {
    const changes = await nameAsPlan(price, current, { legacy: false });
    report.plans.push({ plan: current.name, price: priceId, amount: fmt(price.unit_amount ?? 0, price.currency), subscribers: subscriptions.length, action: changes.length ? `${APPLY ? "named" : "would name"}: ${changes.join(", ")}` : "already named" });
  } else {
    const tag = legacyTags.get(priceId);
    const plan = tag ? PLANS.find((p) => p.key === tag) : null;
    let action = "none (legacy pricing left exactly as is)";
    if (plan) {
      const changes = await nameAsPlan(price, plan, { legacy: true });
      action = changes.length ? `${APPLY ? "labelled" : "would label"} as ${plan.name} (labels only; amount and subscribers unchanged)` : `already labelled ${plan.name}`;
    }
    report.legacyPlanPrices.push({
      price: priceId,
      product: productName,
      amount: `${fmt(price.unit_amount ?? 0, price.currency)} / ${price.recurring?.interval_count ?? 1} ${price.recurring?.interval}`,
      publicPrice: PLANS.map((p) => `${p.name} ${fmt(p.monthlyCents)}/month`).join(", "),
      subscriptions,
      action,
    });
  }
}

// ---- 3. Attach active add-ons ----------------------------------------------
if (ATTACH) {
  if (!env.FIREBASE_ADMIN_PROJECT_ID || !env.FIREBASE_ADMIN_PRIVATE_KEY) {
    report.notes.push("--attach skipped: FIREBASE_ADMIN_* not set. The app also attaches these itself when the agency owner opens Billing.");
  } else {
    const { initializeApp, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    const db = getFirestore();
    const agencies = await db.collection("agencies").get();
    for (const agencyDoc of agencies.docs) {
      const subscriptionId = agencyDoc.get("subscriptionId");
      if (!subscriptionId) continue;
      const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
      const subAccounts = await db.collection("subAccounts").where("agencyId", "==", agencyDoc.id).get();
      for (const a of ADD_ONS) {
        const items = sub.items.data.filter((i) => i.price.id === addOnPrice[a.key] || i.price.metadata?.addon_key === a.key || i.price.lookup_key === a.lookup);
        const tagged = new Set(items.map((i) => i.metadata?.subAccountId).filter(Boolean));
        let legacy = items.filter((i) => !i.metadata?.subAccountId).reduce((n, i) => n + (i.quantity ?? 1), 0);
        for (const sa of subAccounts.docs) {
          if (sa.get(a.gate) !== true || tagged.has(sa.id)) continue;
          if (legacy > 0) { legacy--; continue; }
          const row = { agency: agencyDoc.id, subscription: subscriptionId, subAccount: `${sa.get("name") ?? ""} (${sa.id})`, addOn: a.name, price: addOnPrice[a.key] ?? null };
          if (!addOnPrice[a.key]) {
            report.attached.push({ ...row, result: "not attached — no price (run with --apply)" });
            continue;
          }
          if (APPLY) {
            const item = await stripe.subscriptionItems.create({
              subscription: subscriptionId,
              price: addOnPrice[a.key],
              quantity: 1,
              metadata: { addOnKey: a.key, subAccountId: sa.id },
              proration_behavior: "none",
            });
            report.attached.push({ ...row, item: item.id, result: "attached — bills from next cycle, no proration" });
          } else {
            report.attached.push({ ...row, result: "would attach (no proration)" });
          }
        }
      }
    }
  }
}

console.log(JSON.stringify(report, null, 2));
