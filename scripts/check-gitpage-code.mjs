import { readFileSync } from "node:fs";
import Stripe from "stripe";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]] = v;
}

const stripe = new Stripe(env.GITPAGE_STRIPE_SECRET_KEY);
const code = process.argv[2];

const list = await stripe.promotionCodes.list({ code, limit: 5 });

if (list.data.length === 0) {
  console.log(`No promotion code found matching "${code}" on the gitpage Stripe account.`);
  process.exit(0);
}

for (const pc of list.data) {
  console.log("promotion code:", pc.code);
  console.log("  id:", pc.id);
  console.log("  active:", pc.active);
  console.log("  times_redeemed:", pc.times_redeemed);
  console.log("  max_redemptions:", pc.max_redemptions);
  console.log("  expires_at:", pc.expires_at ? new Date(pc.expires_at * 1000).toISOString() : "(none)");
  console.log("  created:", new Date(pc.created * 1000).toISOString());
  console.log("  buyerEmail (metadata):", pc.metadata?.buyerEmail ?? "(none)");
  console.log("  coupon.percent_off:", pc.coupon?.percent_off);
  console.log("  coupon.duration_in_months:", pc.coupon?.duration_in_months);
  console.log("  coupon.valid:", pc.coupon?.valid);
  console.log("  => REDEEMED?", pc.times_redeemed > 0 ? "YES" : "NO");
  console.log("---");
}
process.exit(0);
