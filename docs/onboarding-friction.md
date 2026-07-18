# Onboarding Friction Log

The record of every friction point hit while going through AgentStack as a real
first subscriber — signup, Business Blueprint, channel setup, the Core Method
templates, and daily use. This log **is** the product backlog: each entry
should be specific enough to turn directly into a fix.

## How to log an entry

Copy the template below for each friction point, in the order you hit it.
Keep entries short — a sentence of what happened, a sentence of what you'd
expect instead, and (if obvious) a proposed fix.

```md
### [YYYY-MM-DD] Short title

- **Step:** which phase/step this happened in (e.g. "Step 2a — Phone/SMS")
- **What happened:** what you actually experienced
- **Expected:** what should have happened instead
- **Time lost:** rough estimate, if relevant
- **Proposed fix:** if you already know what the fix looks like
- **Status:** open / fixed / won't-fix (with why)
```

## Entries

### [2026-07-18] Method Template provisioning bypasses the (unbuilt) blueprint loader

- **Step:** Step 3 — Method Template Library / Step 1 dependency
- **What happened:** The spec wants new-workspace defaults registered "via the
  blueprint loader" (`/seed/blueprint.founder.json` + a loader that provisions
  a workspace from blueprint JSON via the standard signup path). That loader
  doesn't exist — only the plain signup/claim/oauth/repair paths do, via
  `provisionNewAgency()`.
- **Expected:** A single blueprint-driven provisioning path every new-workspace
  default (Method Templates, seed data, persona) registers against.
- **Time lost:** n/a — decided against building a parallel provisioning system
  in the same pass as the templates themselves.
- **Proposed fix:** Wire `seedMethodTemplates()` (already batch-composable,
  see `lib/provisioning/method-templates.ts`) into the blueprint loader
  whenever that gets built, alongside the existing `provisionNewAgency()`
  call sites it's wired into today.
- **Status:** open — functional requirement (new workspaces get the four
  templates) is satisfied via the real signup path; the speculative
  blueprint-JSON loader itself remains unbuilt.

### [2026-07-18] Pre-existing sub-accounts don't retroactively get Method Templates

- **Step:** Step 3 — provisioning-default registration
- **What happened:** `seedMethodTemplates()` only fires at sub-account
  creation time (mirrors `seedDefaultTemplates`'s "new sub-accounts only,
  no backfill" posture). A sub-account that existed before this shipped
  never gets the four templates unless an operator manually adds them from
  the starter gallery.
- **Expected:** Every workspace — new or existing — eventually has the
  baseline templates active.
- **Proposed fix:** Deliberately not built as a batch migration. The one
  case with real behavioral stakes (post-closing review requests) has its
  own narrow fallback instead — see `/api/deals/[id]/route.ts`, which calls
  the review dispatcher directly when no `deal.completed` workflow exists.
- **Status:** won't-fix for now — same product posture as the existing
  default-templates seeder; revisit if operators ask for the other three.

### [2026-07-18] google_review_request's message text isn't Fair-Housing-scanned

- **Step:** Step 3 — shared guardrail layer
- **What happened:** The post-closing template's send node
  (`google_review_request`) delegates to the real Google Review Requests
  feature, whose message body lives on the sub-account's own
  `googleReviewConfig.messageTemplate` — not in the workflow node. The
  guardrail layer's Fair Housing content scan only has access to node-level
  config, so this one send type is gated for quiet hours + escalation but
  NOT content-scanned (documented explicitly in
  `engine.ts::guardedMessageBody()`).
- **Expected:** Every operator-authored contact-facing message gets scanned,
  regardless of where its text is stored.
- **Proposed fix:** Either scan `googleReviewConfig.messageTemplate` at
  save-time (in `/api/sub-accounts/[id]/google-review`), or have
  `execGoogleReviewRequest` fetch the resolved message before sending and
  route it through `checkFairHousing()`.
- **Status:** open — flagged rather than fixed silently, since it touches
  the already-shipped Google Review Requests feature's save path, not just
  the new Method Template surface.

### [2026-07-18] `my-ghl-app/` orphaned scaffold directory

- **Step:** Adding minimal CI
- **What happened:** A single throwaway debug script
  (`my-ghl-app/scripts/debug-logs-query.cjs`) lives at the repo root,
  unreferenced by anything under `src/`, left over from what looks like a
  pre-rename scaffold. It has 2 lint errors (`require()`-style imports)
  that would make a "typecheck, lint, test" CI gate red from its very first
  run if not excluded.
- **Expected:** A clean repo with no stray legacy directories, or at least
  no lint errors leaking from a directory the app doesn't build.
- **Proposed fix:** Applied the minimal one — excluded `my-ghl-app/**` from
  ESLint (`eslint.config.mjs`) so CI reflects the real app's state. Deleting
  the directory entirely is a separate, larger cleanup call (its removal
  wasn't part of this ask).
- **Status:** open (minimal fix applied; full cleanup deferred).

### [2026-07-18] CLAUDE.md's "Node 20+" prerequisite doesn't match pnpm@11.6.0's real requirement

- **Step:** Phase 1 Prerequisites (setup) / adding minimal CI
- **What happened:** The new CI workflow's first-ever run failed immediately
  — `corepack enable` + `pnpm install` under Node 20 crashed with
  `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module: node:sqlite`.
  `package.json`'s pinned `packageManager: "pnpm@11.6.0"` actually requires
  Node ≥22.13 (pnpm 11's store code uses `node:sqlite`, added in Node
  22.5) — but `package.json`'s own `engines.node` still says `">=20"`, and
  CLAUDE.md's Phase 1 Prerequisites tells a new buyer they "need 20+".
  Anyone following that instruction literally on Node 20 hits the same
  crash locally that CI just hit.
- **Expected:** The documented minimum Node version and the `engines`
  field both match what the pinned pnpm version actually requires.
- **Time lost:** ~5 min (one failed CI run, immediately diagnosed from logs).
- **Proposed fix:** Bump `package.json`'s `engines.node` to `">=22.13"` and
  CLAUDE.md's Phase 1 Prerequisites Node check to "need 22.13+". Fixed the
  CI workflow itself (now pins Node 22) since that was the failure blocking
  this PR; the doc + engines-field correction is a separate small edit not
  included here.
- **Status:** open — CI fixed; `engines.node` + CLAUDE.md text not yet
  updated.
