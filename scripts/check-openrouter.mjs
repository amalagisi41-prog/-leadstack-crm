/**
 * Which OpenRouter account is this key actually spending from?
 *
 * Written because that question took a day to answer by inference. The
 * Business Blueprint import started returning AI-CREDIT (HTTP 402), the
 * account dashboard showed $10 available and — decisively — zero requests
 * ever, which meant the balance being drained was not the balance being
 * looked at. A key can belong to a different account or workspace than the
 * one you have open, and it can carry its own spend limit that runs out long
 * before the account does. Neither is visible from the dashboard you happen
 * to be signed into.
 *
 * Usage:
 *   node scripts/check-openrouter.mjs                  # reads .env.local
 *   OPENROUTER_API_KEY=sk-or-... node scripts/check-openrouter.mjs
 *
 * Run it with the value from the production environment to see what the
 * deployed app is really using. The key itself is never printed.
 */

import { readFileSync } from "node:fs";

function loadEnvFile() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {
    // No .env.local — the env var may be supplied directly.
  }
}

loadEnvFile();

const key = process.env.OPENROUTER_API_KEY?.trim();
if (!key) {
  console.error(
    "OPENROUTER_API_KEY is not set. Pass it inline or add it to .env.local."
  );
  process.exit(1);
}

/** Enough to match against the dashboard, not enough to use. */
const fingerprint = `${key.slice(0, 12)}…${key.slice(-4)} (${key.length} chars)`;

async function get(path) {
  let res;
  try {
    res = await fetch(`https://openrouter.ai/api/v1${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return { status: 0, json: null, text: String(error), network: true };
  }
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body, keep the text */
  }
  // A corporate proxy or egress allowlist answers with its own 4xx and a
  // non-JSON body. Calling that "your key is revoked" sends you to fix the
  // wrong thing.
  const network = json === null && res.status !== 200;
  return { status: res.status, json, text, network };
}

const usd = (n) =>
  typeof n === "number" ? `$${n.toFixed(4)}` : String(n ?? "—");

console.log(`\nKey in use: ${fingerprint}\n`);

const keyInfo = await get("/key");
if (keyInfo.network) {
  console.log("Could not reach openrouter.ai — this is a network/proxy issue,");
  console.log("not a verdict on the key. Run this from a machine with egress.");
  console.log(`  ${keyInfo.text.slice(0, 200)}`);
  process.exit(3);
}
if (keyInfo.status === 401 || keyInfo.status === 403) {
  console.log("VERDICT: the key is rejected — wrong, revoked, or deleted.");
  console.log(keyInfo.text.slice(0, 300));
  process.exit(2);
}
if (keyInfo.status !== 200) {
  console.log(`Could not read the key: HTTP ${keyInfo.status}`);
  console.log(keyInfo.text.slice(0, 300));
  process.exit(2);
}

const d = keyInfo.json?.data ?? {};
console.log("--- this key ---");
console.log(`  label:        ${d.label ?? "—"}`);
console.log(`  usage:        ${usd(d.usage)}`);
console.log(
  `  key limit:    ${d.limit == null ? "none" : usd(d.limit)}${
    d.limit_remaining != null ? `  (remaining ${usd(d.limit_remaining)})` : ""
  }`
);
console.log(`  free tier:    ${d.is_free_tier ?? "—"}`);

const credits = await get("/credits");
if (credits.status === 200) {
  const c = credits.json?.data ?? {};
  const remaining =
    typeof c.total_credits === "number" && typeof c.total_usage === "number"
      ? c.total_credits - c.total_usage
      : null;
  console.log("\n--- the account this key belongs to ---");
  console.log(`  purchased:    ${usd(c.total_credits)}`);
  console.log(`  spent:        ${usd(c.total_usage)}`);
  console.log(`  remaining:    ${usd(remaining)}`);

  console.log("\n--- verdict ---");
  if (d.limit != null && d.limit_remaining != null && d.limit_remaining <= 0) {
    console.log(
      "  The KEY's own spend limit is exhausted, even though the account may\n" +
        "  still hold credit. Raise or clear the limit on this key."
    );
  } else if (remaining != null && remaining <= 0) {
    console.log("  The account is out of credit. Top it up.");
  } else if (remaining != null) {
    console.log(
      `  ${usd(remaining)} available to this key. A 402 now would mean a\n` +
        "  per-key limit or a workspace restriction, not an empty balance."
    );
  }
  console.log(
    "\n  Compare 'purchased' and 'spent' against the dashboard you have open.\n" +
      "  If they disagree, the deployed app is on a different account than the\n" +
      "  one you are looking at — which is the failure this script exists for."
  );
} else {
  console.log(`\nCould not read account credits: HTTP ${credits.status}`);
  console.log(credits.text.slice(0, 300));
}
console.log("");
