#!/usr/bin/env node
/**
 * Build-time guard: every prerendered public page must quote the configured
 * AgentStack Solo price, and only that price.
 *
 *   pnpm build && node scripts/check-public-prices.mjs
 *
 * Reads SOLO_PRICE from src/lib/public-site/offer.ts (the single source of
 * truth /pricing, checkout and the comparison pages use), then scans the
 * built HTML in .next/server/app. Fails if any page contains "$199" (the
 * stale price that once shipped on the comparison pages) or mentions Solo
 * next to a different dollar figure.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const offer = readFileSync(join(root, "src/lib/public-site/offer.ts"), "utf8");
const configured = offer.match(/export const SOLO_PRICE = (\d+);/)?.[1];
if (!configured) {
  console.error("check-public-prices: could not read SOLO_PRICE from offer.ts");
  process.exit(1);
}

const appDir = join(root, ".next/server/app");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".html")) files.push(p);
  }
})(appDir);
if (files.length === 0) {
  console.error("check-public-prices: no built pages found — run `pnpm build` first.");
  process.exit(1);
}

const problems = [];
for (const file of files) {
  const text = readFileSync(file, "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, (s) => (s.includes("application/ld+json") ? s : ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");
  const page = "/" + relative(appDir, file).replace(/\.html$/, "").replace(/index$/, "");
  if (text.includes("$199")) problems.push(`${page}: contains "$199"`);
  const near = /Solo[^$.]{0,40}\$(\d[\d,]*)|\$(\d[\d,]*)(?:\/mo(?:nth)?)?[^.$]{0,25}\bSolo\b/g;
  for (const m of text.matchAll(near)) {
    const amount = (m[1] ?? m[2]).replace(/,/g, "");
    if (amount !== configured) problems.push(`${page}: Solo quoted at $${amount} ("${m[0].trim()}")`);
  }
}

if (problems.length) {
  console.error(`check-public-prices: Solo must be $${configured} everywhere.\n` + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`check-public-prices: ${files.length} pages OK (Solo = $${configured}).`);
