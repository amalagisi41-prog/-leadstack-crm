#!/usr/bin/env node
/**
 * CORS lint guard.
 *
 * Scans every API route file under `src/app/api/**​/route.ts` for the
 * presence of `Access-Control-Allow-Origin: *` (or equivalent). Fails the
 * build when an open-CORS surface lands outside the allowlist below.
 *
 * Why: forms-ingest endpoints are deliberately open-CORS so they can be
 * called from any third-party site. Every other endpoint MUST reject
 * cross-origin browser requests — keys + session cookies leak via XSS if
 * an admin route accidentally allows wildcard origin.
 *
 * Wiring:
 *   - Add to package.json scripts:  `"lint:cors": "node scripts/lint-cors.mjs"`
 *   - Add to CI just before `pnpm build`. Build red on any violation.
 *   - Optionally add a pre-commit hook running the same.
 *
 * Allowlist matches: routes that intentionally allow cross-origin
 * browser POSTs because the design requires it.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, "..");
const API_ROOT = join(PROJECT_ROOT, "src", "app", "api");

/**
 * Each entry is a relative path (POSIX-style) under src/app/api. Listed
 * here is the explicit allowlist of files that may serve `Access-Control-
 * Allow-Origin: *` (or any wildcard) on their responses.
 *
 * To add a new open-CORS endpoint:
 *   1. PR must include a security review note in the description.
 *   2. Endpoint must be write-only AND scope-limited (e.g. forms-ingest).
 *   3. Add the path here.
 */
const OPEN_CORS_ALLOWLIST = new Set([
  "forms/[id]/submit/route.ts",
  "v1/forms/[formId]/submissions/route.ts",
  // Web Chat widget endpoints — public from-the-browser API. Origin
  // validated per-sub-account inside the route.
  "web-chat/config/route.ts",
  "web-chat/message/route.ts",
  "web-chat/capture/route.ts",
]);

const CORS_REGEX =
  /Access-Control-Allow-Origin[^,]*?["'`:]?\s*["'`]?\*/i;

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name === "route.ts") {
      yield full;
    }
  }
}

function posix(p) {
  return p.split(sep).join("/");
}

async function main() {
  const violations = [];
  for await (const file of walk(API_ROOT)) {
    const rel = posix(relative(API_ROOT, file));
    const text = await readFile(file, "utf8");
    if (CORS_REGEX.test(text)) {
      if (!OPEN_CORS_ALLOWLIST.has(rel)) {
        violations.push(rel);
      }
    }
  }

  if (violations.length === 0) {
    console.log("[lint-cors] OK — no unauthorised open-CORS surfaces.");
    process.exit(0);
  }

  console.error(
    "[lint-cors] FAIL — found Access-Control-Allow-Origin: * outside the allowlist:",
  );
  for (const v of violations) {
    console.error(`  src/app/api/${v}`);
  }
  console.error(
    "\nIf this is intentional, add the path to OPEN_CORS_ALLOWLIST in scripts/lint-cors.mjs",
  );
  console.error(
    "AND document the security review in the PR. Otherwise, remove the open-CORS header.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[lint-cors] script failed:", err);
  process.exit(1);
});
