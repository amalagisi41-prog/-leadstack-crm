# LeadStack CRM

## Audience for this document

This file is written for **the buyer who just generated their own repo from the LeadStack template** (`Claude-Code-Pro-Camp/leadstack-agency` → "Use this template"; see SETUP.md Phase 1) and is setting it up — usually with Claude Code's help. Their repo is a standalone copy in their own GitHub account, with no upstream link back to the template. The landing page is a white-label CRM template the buyer brands as their own (via `CUSTOM_BRAND` in `src/config/landing.ts`). The buyer's deployment becomes their product, not "LeadStack".

Everywhere you see `LeadStack` referenced below, that's just the name of the repo + codebase you're working with — substitute the buyer's brand wherever it appears.

## Project Overview
A production-ready, all-in-one CRM styled after GoHighLevel and HubSpot, scoped for small teams. Buyers self-host, brand it as their own, and sell to their clients however they like.

The codebase ships with every core surface already functional: contacts, pipeline, calendar, tasks, forms (with public hosted pages + iframe embed), reports, global search, shared-sender email + SMS, plus AI Agents — one persona per client sub-account answering across **Web Chat, SMS, WhatsApp, and Voice (inbound)**, and proactively dialing out via **Outbound Voice** (single click-to-call + bulk campaigns). All external dependencies are user-provided credentials; the repo contains no embedded secrets.

## Auth & Tenancy Model

LeadStack is a **GHL-style multi-tenant CRM**: an agency operator owns one or more **sub-accounts**, each an isolated workspace with its own contacts, deals, pipeline, etc. Sub-accounts are URL-scoped at `/sa/[subAccountId]/...`.

### Hierarchy

- **Agency** (`agencies/{agencyId}`): top-level tenant. One per deployment in v1. Owner is the first signup.
- **Sub-account** (`subAccounts/{subAccountId}`): a workspace inside an agency. Holds the per-client data.
- **Membership**: `subAccounts/{saId}/subAccountMembers/{uid}` rows track who can access each sub-account and at what role.

### Roles

- **agencyOwner** — the bootstrap user. Implicit `admin` inside every sub-account in their agency. Manages billing.
- **subAccountAdmin** — manages members + settings of one sub-account. Full read/write inside it.
- **subAccountCollaborator** — read/write data inside one sub-account. No member management.

### Claims & rules

- Custom claims (set by `/api/auth/signup` and `/api/auth/refresh-claims`): `{ role, status, agencyId, agencyRole }`. All scalars — JWT size cap forbids per-sub-account membership lists.
- Per-sub-account memberships live in Firestore. Rules read them via `get()` once per request.
- Agency-owner shortcut: rule passes on claim comparison (0 `get()`s) when `agencyRole == "owner"` and `agencyId` matches the doc's agency.

### First signup → agency owner

`/api/auth/signup` runs a transaction on `appConfig/main`. If it doesn't exist, the signing-up user (gated by `BOOTSTRAP_ADMIN_EMAIL`) becomes the agency owner; the route mints an agency, a default "Main" sub-account, owner+admin memberships, and the user's claims. Subsequent signups must match an unrevoked, unaccepted `invites/{auto}` doc that names a specific sub-account + role.

### Tenancy keys on every doc

Every doc in `contacts`, `deals`, `tasks`, `events`, `forms`, `usage` carries:
- `agencyId` (for the agency-owner shortcut in rules)
- `subAccountId` (the primary tenancy key, used in client `where()` queries)
- `createdByUid` (audit only)

Subcollections (`contacts/{id}/notes`, `forms/{id}/submissions`, etc.) inherit tenancy via the parent — rules read the parent's `subAccountId`.

### Removal

Removing a member from a sub-account sets the membership doc's status to `removed` and drops the user's `userMemberships` index entry. If the user has no other active memberships and no agency role, their `users/{uid}.status` flips to `removed`, custom claims update to `status: "removed"`, and the Firebase Auth user is disabled. AuthContext force-signs-out on next page load.

### Routing

- `/agency` — agency landing page with sub-account picker.
- `/agency/sub-accounts` — list + create.
- `/agency/sub-accounts/new` — create form.
- `/sa/[subAccountId]/dashboard` etc. — per-sub-account CRM pages, mounted under `<SubAccountProvider/>`.
- Legacy `/contacts`, `/dashboard`, etc. are stub pages that redirect to the user's first-membership sub-account (kept so external links like the landing nav still work).

### `useAuth()` and `useSubAccount()`

- `useAuth()` exposes `user`, `agencyId`, `agencyRole`, `memberships[]`, plus a legacy `adminUid` that is still populated for back-compat with components that haven't migrated.
- `useSubAccount()` (only mounted inside `/sa/[subAccountId]/`) exposes the active sub-account, the caller's effective role (`isAdmin`), and `saPath(path)` for templating internal links.

## Agency feature gates

A small set of optional booleans on `SubAccountDoc` that **only the agency owner can flip**. Sub-account admins can do everything else in their workspace, but features that consume agency resources (Resend slots, API keys, mass-mail reputation) are gated so a tenant can't accidentally turn them on. Today's gates:

| Gate field | What it controls | Default | Tear-down on disable? |
|---|---|---|---|
| `emailDomainEnabledByAgency` | Sub-account can register + verify a dedicated Resend sending domain | `false` (legacy `undefined` reads as off) | **Yes** — the live Resend domain is removed and `resendConfig` cleared so the agency doesn't keep paying for an unused slot. `tenantFrom()` short-circuits the moment the gate flips off so sends fall back to the shared `EMAIL_FROM` even before the cleanup write lands. |
| `apiAccessEnabledByAgency` | All `/api/v1/*` traffic from this sub-account's keys + new key/webhook minting | `false` | No — keys + webhook subscriptions are PRESERVED so re-enabling resumes integrations without forcing the tenant to re-rotate Zapier-style consumers. The API auth middleware (`lib/api/auth.ts`) just refuses requests while the gate is off. |
| `broadcastsEnabledByAgency` | Bulk-email broadcasts (the Send route + the sidebar entry) | `false` | No — historical broadcast docs + in-flight QStash messages are untouched. The send route 403s while off; re-enable for instant restoration. |
| `whatsappEnabledByAgency` | The WhatsApp AI channel (Twilio-delivered) — enabling the channel, the inbound WhatsApp webhook, and the contact-profile WhatsApp thread | `false` | No — the sub-account's Twilio creds + WhatsApp sender number (shared with SMS) are preserved. While off: the channel-enable route 403s, the inbound webhook (`/api/webhooks/twilio/whatsapp/inbound`) ignores the sub-account, and the channel settings card shows a "Locked by your agency" state. Re-enable resumes instantly. |
| `outboundVoiceEnabledByAgency` | The Outbound Voice channel — operator-initiated AI calls: the contact-profile click-to-call button, the test-call, and bulk voice campaigns (`/api/comms/voice/call`, `/api/comms/voice/test-call`, `/api/comms/voice/campaign/*`) | `false` | No — the sub-account's voice channel config + provisioned Vapi assistant/number (shared with inbound Voice) are preserved. While off: the call + campaign routes 403, the contact-profile call button + AI Agents → Outbound Voice section show a "Locked by your agency" state. Re-enable resumes instantly. Inbound Voice is unaffected — outbound is independently gated because it spends Vapi minutes proactively and carries dialing-compliance risk. |
| `metaInboxEnabledByAgency` | **Beta master switch** for the Facebook Messenger + Instagram DM unified-inbox channels (both ride one Meta connection, so they flip together) | `false` | No tear-down — while off the inbox surface is **inert and invisible** everywhere. Ships off so an agency lights it up only for a sub-account that has a connected Meta account and volunteers to beta-test. Re-enabling resumes instantly. |
| `socialPlannerEnabledByAgency` | **Beta master switch** for the Social Planner (schedule + auto-publish posts to the connected Facebook Page / Instagram Business) — the sidebar entry, the connect/create/publish routes, and posting scopes at connect time | `false` | No tear-down — scheduled posts + the Meta connection are preserved. While off: the Social Planner sidebar entry renders a "Locked by your agency" state and the connect/create/publish routes 403. **Shares the same `metaConfig` connection as the inbox** — it does NOT add a second connection (see "Social Planner v1"). Re-enabling resumes instantly. |

**Wiring pattern (same shape for every gate):**
1. **Schema** — optional boolean on `SubAccountDoc` (`*EnabledByAgency`). Read `=== true` so legacy docs missing the field default to off.
2. **Default at creation** — both sub-account creation sites (`/api/auth/signup` + `/api/agency/sub-accounts`) write `false` explicitly. Existing-deployment legacy docs inherit the "undefined = off" treatment via the strict-equality reads.
3. **Agency-only PATCH** — `PATCH /api/agency/sub-accounts/[id]/feature-gates` accepts any subset of `{emailDomainEnabled, apiAccessEnabled, broadcastsEnabled, outboundVoiceEnabled, whatsappEnabled, metaInboxEnabled, websiteEnabled, socialPlannerEnabled}` (only fields you send get applied). Auth-gated to `subAccountRole === "agencyOwner"`.
4. **Runtime enforcement** — each consumer route checks the matching field and returns 403 with a friendly "ask your agency owner" message when off. Tenant-facing UI (settings card, sidebar entry) shows a Lock state instead of the feature.
5. **Agency-side UI** — the `SubAccountManageDialog` (opened from the agency's `/agency/sub-accounts` list via the per-row Manage button) renders one checkbox per gate. Email's disable shows a destructive-action warning when there's a live domain; API + Broadcasts disable is silent (no destructive side-effect).

Adding a new gate: add the field to `SubAccountDoc`, write the default at the two creation sites, add the runtime check in the consumer, add a `wantsX` branch to the PATCH route, add a checkbox to the manage dialog. The dialog `payload` shape is deliberately additive — sending only the dirty fields keeps the PATCH minimal.

## Landing page (white-label)

`src/config/landing.ts` exports `CUSTOM_BRAND`. The root `app/page.tsx` renders a generic agency-CRM landing the buyer brands as their own product. All copy is pulled from `CUSTOM_BRAND` (`name`, `tagline`, `shortDescription`, `supportEmail`, `primaryDomain`, `pricing.{starter, pro, scale}`). The page renders 5 sections (hero, features, pricing, FAQ, CTA) wrapped in navbar + footer. Edit `CUSTOM_BRAND` before deploy so signups land on the buyer's brand.

## Tech Stack
- **Framework:** Next.js 15 (App Router, Turbopack) with TypeScript
- **Auth:** Firebase Authentication (email/password) + `next-firebase-auth-edge` session cookies + custom claims (`role`, `status`)
- **Database:** Cloud Firestore (owner-scoped security rules)
- **Payments:** Stripe Checkout + Billing Portal + Webhooks
- **Email:** Resend (shared-sender, LeadStack owns the account; cost baked into plan price)
- **SMS:** Twilio (same shared-sender model)
- **AI replies:** OpenRouter as the model gateway (one key, any model). Default to Claude Haiku 4.5 for cost/quality; per-channel override possible.
- **Website KB scrape:** Firecrawl (`/v1/scrape`, agency-level key). Powers the optional homepage knowledge base on the AI Agent profile.
- **Kanban:** `@dnd-kit/core` (draggable deals across stages)
- **Tables:** `@tanstack/react-table` (contacts list)
- **Styling:** Tailwind CSS v4 + shadcn/ui + Geist Sans + Instrument Serif (display accents)
- **Theming:** next-themes (light / dark / system)
- **Toasts:** sonner
- **Marketing tracking:** Meta Pixel + Google Tag Manager (script tags conditional on env vars, identical pattern to Crisp)
- **Live chat / support:** Crisp Chat (widget loaded site-wide when configured; used as the primary support channel in place of mailto)
- **Deployment:** Vercel

## Core Features (all shipped)
- **Contacts** — list + search, add/edit modal, profile with notes + unified activity timeline, CSV import/export
- **Pipeline / Kanban** — `@dnd-kit` 6-stage board (New → Contacted → Qualified → Proposal → Won / Lost), deal cards with value + days-in-stage, lost-reason prompt
- **Calendar** — manual events, month grid with click-to-add, optional contact linking, activity write on create
- **Tasks** — Today / Overdue / Upcoming / Done, due-today badge in sidebar, linkable to contacts
- **Forms** — drag-order field builder, 6 field types, `mapsTo` contact fields, public page at `/f/[id]`, iframe embed, auto-creates contact + optional deal on submit
- **Quotes** — GHL-style estimates: build line-itemed quote with discount/tax/terms/validity, send via branded email, recipient views + accepts (or declines with reason picker) on a public `/q/[token]` page. Year-prefixed numbering (`Q-2026-0001`), multi-currency, lifecycle states (Draft → Sent → Viewed → Accepted/Declined/Expired → Paid). Auto-creates a Won-stage Deal on accept (per-quote toggle). Mark-paid is manual — v1 has no payment collection. Operator views from the sidebar Quotes tab OR the contact profile section.
- **Reports** — date-range KPIs, pipeline funnel, won-revenue area chart, leads-by-source donut, inline SVG (no chart library)
- **Cmd+K search** — global palette across contacts, deals, tasks, events, forms
- **Leads map** — Mapbox-powered world map on the sub-account dashboard with clustered pins. Location captured server-side at form submit (ipapi.co + phone country-code fallback). Renders graceful empty / "not configured" states when no token or no located contacts.
- **Email + SMS** — from a contact profile, shared LeadStack sender with user's email on `Reply-To` so replies bypass the app. Each sub-account can OPT IN to a **dedicated email sending domain** (Resend's Domains API) so outbound sends from that tenant come from their own brand (e.g. `hello@mail.acmeplumbing.com`); gated by the agency owner per sub-account, falls back cleanly to the shared sender otherwise.
- **Booking pages** — public `/b/[saId]/[slug]` slot picker per sub-account. Recipient picks an available slot, the server transactionally re-verifies availability + reconciles a contact, then mints an Event + sends ICS-attached confirmation emails. Reschedule + cancel + reminder + paid-or-expire lifecycle steps are all queued through QStash. Lifecycle helpers fire the same activity-log + automation triggers other features use.
- **Public API (v1)** — REST endpoints under `/api/v1/*` for contacts / deals / tasks / events / form submissions plus signed outbound webhooks. Per-sub-account API keys (`lsk_live_*` / `lsk_test_*`), idempotency-key support, response envelope versioning, per-key rate limits, and an `apiAccessEnabledByAgency` agency gate that disables a tenant's keys without rotating them. Operator surfaces include API Keys, Webhooks, and API Recipes sections in sub-account settings.
- **AI Agents** — one persona (system prompt + business hours + escalation keywords + optional Firecrawl-scraped website KB) shared across every active channel. Five live channels: **Web Chat** (embeddable iframe widget with inline lead-capture form), **SMS** (auto-replies to inbound SMS on the sub-account's dedicated Twilio number), **WhatsApp** (auto-replies on the Twilio WhatsApp sender — beta; agency-gated), **Voice** (Vapi-powered AI answering inbound calls on the same Twilio number — qualifies the lead + books a callback), and **Outbound Voice** (the AI proactively dials contacts — single click-to-call from a contact, or a bulk campaign over a filtered audience — behind a native dialing-compliance gate; agency-gated). Captures across all channels trigger an automatic Task + escalation email. Operator consoles: Web Chat → Sessions (transcripts), Voice → Calls (call summaries + transcripts), Outbound Voice → Campaigns (per-recipient status). Email + Google Business Profile are scaffolded as hidden "coming soon" placeholders.
- **Social Planner** — schedule + auto-publish posts to a sub-account's connected Facebook Page / Instagram Business account. Gated `/social` sidebar entry with a content calendar + post list + composer (caption + pasted image URL + FB/IG targets + schedule). Posts queue through QStash and publish via the Graph API at the scheduled time. **Rides the same one `metaConfig` Meta connection as the inbox** (no second connection) — agency-gated via `socialPlannerEnabledByAgency`. v1 is Meta-only, single-image-URL (no upload). See "Social Planner v1".
- **Billing** — Stripe checkout + customer portal + webhooks, Free / Pro / Scale plans
- **Marketing attribution** — every public form submission captures `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`, `gclid`, document referrer, and landing-page URL from the visitor's browser, then stores them on the contact's `attribution` field. `source` falls back to `utm_source` when present. Fires Meta Pixel `Lead` event client-side on successful submit.
- **Settings** — profile edit, theme, subscription, CSV export, sign-out

## Project Structure
```
src/
  app/
    (auth)/                       Login + Signup pages
    (legal)/                      Terms of Service + Privacy Policy
    (embed)/                      Iframe-able routes that bypass dashboard chrome
      embed/chat/[subAccountId]/  AI Agents Web Chat widget iframe target
    (dashboard)/                  Protected pages
      agency/                     Agency landing + sub-account picker
        get-started/              First-run onboarding (after agency owner signup)
        sub-accounts/             List + create new sub-account
      sa/[subAccountId]/          Per-sub-account CRM (the working surface)
        dashboard/                Home: KPI summary + pipeline snapshot + activity
        dashboard/settings/       Profile, theme, subscription, members, SMS, send-window
        contacts/                 List + [id] profile (notes, activities, send email/SMS)
        pipeline/                 6-stage Kanban (drag-drop deals)
        calendar/                 Month grid + events
        tasks/                    Today / Overdue / Upcoming / Done
        forms/                    Builder list + [id] editor (drag-order fields, mapsTo)
        quotes/                   List + new + [id] detail/edit (operator-facing quote flow)
        reports/                  Date-range KPIs + funnel + charts
        automations/              Recipe list + activity logs + settings + templates
        broadcasts/               Bulk-email list + [id] detail (live status)
        social/                   Social Planner — content calendar + post list + composer + Connections tab (agency-gated)
        website/                  gitpage.site builder (long sectioned form)
        ai-agents/                Shared persona + KB (Overview) + per-channel pages
          (page.tsx)              Overview: AgentProfileSection + channel status grid
          web-chat/               Web Chat settings (toggle, theme, allowed domains, snippet)
          web-chat/sessions/      Live operator console — list + [sessionId] transcript
          sms/                    SMS channel settings (toggle, model, escalation)
          whatsapp/               WhatsApp channel settings (toggle, escalation)
          whatsapp/templates/     WhatsApp template manager (gallery + builder + approval status)
          voice/                  Inbound Voice channel settings (Vapi number mode, greeting, voice)
          voice/calls/            Voice operator console — list + [callId] call summary + transcript
          outbound/               Outbound Voice — click-to-call config + campaign launcher
          outbound/campaigns/     Campaign list + [campaignId] per-recipient status
          email/ google-business/ Hidden coming-soon placeholders (pages resolve if hit directly)
      contacts/ dashboard/ ...    Legacy flat routes — redirect to the first sub-account
    f/[formId]/                   Public hosted form (unauthenticated)
    q/[token]/                    Public quote view + accept/decline landing (unauthenticated, HMAC-token-gated)
    u/[token]/                    Public unsubscribe landing (unauthenticated)
    thank-you/                    Post-signup landing
    api/
      auth/signup/                Create user; first-signup bootstrap mints agency + Main SA
      auth/refresh-claims/        Re-mint custom claims after membership changes
      agency/                     PATCH agency, list/create sub-accounts, gitpage-status refresh
      sub-accounts/[id]/
        invite/                   Create + accept member invites
        members/[uid]/            Update role / revoke access
        twilio/                   Save dedicated Twilio creds (auto-wires inbound webhook)
        website/                  POST create-site (cap-enforced); [siteId]/build|poll|
        website/[siteId]/...      poll-now|DELETE (reset via ?reset=1, else remove)
      contacts/[id]/              DELETE contact + subcollections + referencing deals/tasks
      forms/[id]/submit/          Public form submission (unauthenticated; admin SDK)
      comms/email/send/           Send email (Resend, shared-sender)
      comms/sms/send/             Send SMS (Twilio, env-var or per-SA dedicated)
      automations/step/           QStash callback — executes one Speed-to-Lead step
      broadcasts/email/send/      Initiate bulk email (validate + fan out to QStash)
      broadcasts/email/step/      QStash callback — sends one recipient's email
      u/[token]/                  POST unsubscribe (flips contact.emailOptedOut)
      cron/gitpage-heartbeat/     Daily QStash-scheduled telemetry + status cache
      webhooks/stripe/            Stripe subscription webhook
      webhooks/twilio/inbound/    Inbound SMS (STOP/START opt-out + chat-thread writes + AI auto-reply)
      sub-accounts/[id]/
        ai-agent/profile/         GET/PATCH shared agent profile (persona, hours, KB)
        ai-agent/profile/         POST refresh-kb → Firecrawl scrape of websiteUrl
          refresh-kb/
        ai-agent/channels/        GET/PATCH per-channel config (enabled, model, overrides)
          [channel]/
        ai-agent/test/            POST dry-run the persona against a test message
      web-chat/config/            GET widget config (theme + welcome). Origin-gated.
      web-chat/message/           POST visitor message → bot reply. Rate-limited.
      web-chat/capture/           POST inline-form submit → Contact + Task + escalation email
      sub-accounts/[id]/
        quotes/                   POST create draft quote (issues atomic per-SA sequence number)
        quotes/[quoteId]/send/    POST send/re-send quote (issues fresh HMAC token, sends email)
        quotes/[quoteId]/mark-paid/  POST flip accepted → paid (manual; no payment collection in v1)
      quotes/[token]/respond/     POST anonymous accept/decline (HMAC-token-gated, txn-wrapped)
      dev-only/danger-wipe-       DEV TESTING ONLY — wipes everything in the agency
        everything/               (owner-gated; not for production use)
  components/
    ui/                  shadcn/ui primitives
    auth/                Login + signup forms
    landing-custom/      White-label marketing page (navbar, hero, features, pricing, FAQ, CTA, footer)
    brand/               Brand mark / logo components
    agency/              Agency landing + sub-account picker UI
    dashboard/           Sidebar + Header (dynamic title + Cmd+K trigger + SA switcher)
    contacts/            Table, profile, activity timeline, send-email/sms + bulk-email dialogs
    pipeline/            Board, deal card, new-deal + lost-reason dialogs
    calendar/            Month view + event dialog
    tasks/               Task item + task dialog
    forms/               Public form renderer + builder pieces
    quotes/              quote-builder (line-item editor + live totals), quote-list (filter chips + search), quote-detail (view/edit + Send/Mark-paid/Delete), quote-status-badge, public-quote-view (recipient accept/decline + reason picker)
    reports/             SVG chart primitives
    automations/         Recipe attach UI, template editor, history viewer
    ai-agents/           Channel nav tabs + AgentProfileSection (persona+KB) + SMS/WebChat channel sections + WebChatSessionsList + WebChatSessionThread
    web-chat/            ChatWindow component rendered inside the embed iframe (self-contained, immune to host CSS)
    social/              Social Planner: social-content-calendar (month grid of posts), social-post-composer (caption + image URL + FB/IG targets + schedule dialog), social-connections (read-only status + deep link to Settings)
    analytics-scripts.tsx  Crisp/GTM/Pixel loader — skips on /embed/* so the chat iframe doesn't render a nested support widget
    search/              Cmd+K command palette
    settings/            Sub-account members + per-SA Twilio config sections
  config/
    landing.ts           CUSTOM_BRAND fields (white-label config)
  lib/
    firebase/            Client + admin SDK (admin uses "server-only" guard) + auth helpers
    stripe/              Checkout + portal + webhooks + client/server helpers
    comms/               Resend + Twilio wrappers, route-auth, usage counter, SMS segments, per-SA config; meta.ts (server-only Graph API: OAuth, scopes, granted-scope read, send + Social Planner publish helpers), meta-capabilities.ts (client-safe metaCanInbox/metaCanPublish/deriveMetaCapabilities)
    comms/ai/            AI Agents: agent.ts (profile + per-channel resolver + lazy migration), respond.ts (SMS orchestrator), prompt.ts (channel-aware system prompt + KB injection), context.ts (contact context block), escalation.ts (keyword match + email notify), openrouter.ts (LLM client)
    comms/web-chat/      Web Chat: session.ts (get-or-create + history + capture-state), respond.ts (orchestrator returning reply over HTTP), capture.ts (parse [[form]] + [[capture]] markers, Contact reconciliation), follow-up.ts (post-capture Task + escalation email), origin.ts (Origin allowlist), rate-limit.ts (in-memory IP + session caps)
    firecrawl/           client.ts — agency-level scrape wrapper (/v1/scrape, 30s timeout, FirecrawlError)
    firestore/           CRUD helpers per collection (contacts, deals, tasks, events, forms, quotes, activities, users, mail, web-chat-sessions, social-posts)
    quotes/              calc.ts (pure money math + isQuoteExpired), token.ts (HMAC + nonce public-share token, only SHA-256 hash persisted), number.ts (atomic Q-YYYY-NNNN sequence per sub-account), email.ts (recipient email subject + text + html), lifecycle.ts (recordQuoteActivity + fireQuoteTrigger + autoCreateDealForAcceptedQuote — side-effects swallow errors so they can't break the primary write)
    automations/         triggers, executor, qstash, merge-tags, unsubscribe-token, seed-templates, template-presets
    broadcasts/          audience.ts (filter resolution for bulk email recipients)
    contacts/            location.ts (IP geo via ipapi.co + phone country-code parsing + country centroids)
    landing/             resolve-brand.ts (server-side: merges agency doc over CUSTOM_BRAND for the custom landing)
    gitpage/             client.ts (gitpage REST SDK) + heartbeat.ts (telemetry + status cache)
    website/             gitpage-values.ts (curated dropdown values), niches.ts, validation.ts
    forms/               Form appearance/styling helpers
    auth/                require-admin, require-tenancy guards
    health/              Liveness checks (incl. OpenRouter + Firecrawl checks under the ai-agents category)
    attribution.ts       readAttributionFromBrowser() + trackLeadEvent() — captures UTM/fbclid/gclid/referrer/landing-page from URL params and fires Meta Pixel Lead event on form submit
    crisp.ts             openCrispChat() — typed wrapper around the global $crisp queue; safe no-op when the widget isn't loaded
    csv.ts               CSV parse + serialize + contact-field fuzzy matcher
    format.ts            Date / relative-time / currency formatters
    utils.ts             cn() class merger
  hooks/                 useAuth, useSubAccount, useDueTodayCount, etc.
  context/               AuthContext + SubAccountContext providers
  types/                 Per-domain TypeScript types
  middleware.ts          Auth gating (next-firebase-auth-edge); PUBLIC_PATHS + PUBLIC_PATH_PATTERNS (includes /api/web-chat + /embed + /widget.js)
public/widget.js         Vanilla JS widget loader (~4KB). Snippet on the buyer's clients' sites pulls this file; it injects a floating bubble + lazy-loads the iframe pointing at /embed/chat/[saId].
next.config.ts           Headers config — CSP frame-ancestors * for /embed/* so the chat iframe loads cross-origin; CORS + cache-control on /widget.js.
instrumentation.ts       Cold-start gitpage heartbeat ping
firestore.rules          Tenancy + role-based security rules
firebase.json            Deploys firestore.rules only
```

## Firestore Collections
| Collection | Scope | Notes |
|---|---|---|
| `agencies/{agencyId}` | agency-read | Agency profile + Stripe billing (one per deployment in v1) |
| `agencies/{agencyId}/agencyMembers/{uid}` | agency-read | Owner / staff list |
| `subAccounts/{subAccountId}` | members + agency owner | Workspace metadata; reserved fields for Workflow-Recipes Twilio/Resend/booking/sendWindow |
| `subAccounts/{subAccountId}/subAccountMembers/{uid}` | admins | Per-sub-account membership rows |
| `userMemberships/{uid}/subAccounts/{saId}` | self-read | Denormalized index powering the sub-account switcher |
| `userMemberships/{uid}/agencies/{agencyId}` | self-read | Denormalized index for agency-level access |
| `users/{uid}` | self only | Slim profile (display name, photoURL, primaryAgencyId) |
| `appConfig/main` | active members | Bootstrap singleton: `firstAgencyId`, `firstAgencyOwnerUid` |
| `system/heartbeat` | server-only | Instance id + last-heartbeat timestamp (anonymous telemetry) |
| `system/gitpageStatus` | active members read | Cached gitpage subscription state; drives the activate-banner UI |
| `invites/{auto}` | agency owner / sub-account admin | Typed invites (carry `subAccountId` + `subAccountRole`) |
| `contacts/{id}` | sub-account | Carries `agencyId`, `subAccountId`, `createdByUid` |
| `contacts/{id}/notes/{id}` | inherits | Free-text notes |
| `contacts/{id}/activities/{id}` | inherits | Typed events |
| `deals/{id}` | sub-account | One contact → many deals |
| `events/{id}` | sub-account | Calendar events |
| `tasks/{id}` | sub-account | Todos |
| `forms/{id}` | sub-account | Form config |
| `forms/{id}/submissions/{id}` | sub-account read, server-write | Inbound submissions; route stamps tenancy from the form doc |
| `usage/{subAccountId}/users/{uid}` | self/owner read | Email + SMS quotas |
| `mail/{id}` | server-only | Trigger-Email extension queue |
| `automations/{id}` | sub-account; admin-write | Recipe configs (one per attached form). Carries `agencyId`, `subAccountId`, `recipeType`, `trigger`, `config`, `enabled` |
| `message_templates/{id}` | sub-account; admin-write | Reusable email + SMS bodies with merge tags |
| `automation_executions/{id}` | sub-account read; server-only write | Per-firing run rows; the QStash callback executor mutates these |
| `contacts/{id}/messages/{id}` | sub-account read; server-only create/delete; client `readAt`-only update | SMS chat thread when the sub-account has dedicated Twilio enabled. Doc id = Twilio MessageSid for natural dedupe on retries. |
| `contacts/{id}/whatsappMessages/{id}` | sub-account read; server-only create/delete; client `readAt`-only update | WhatsApp chat thread (same model as `messages`). Populated by the WhatsApp inbound webhook + `/api/comms/whatsapp/send` + `/api/comms/whatsapp/send-template`. Doc id = Twilio MessageSid. |
| `subAccounts/{id}/whatsappTemplates/{id}` | members read; server-only write | WhatsApp message templates (v2). Carries the body + positional variables, Twilio `contentSid`, and the Meta approval `status`. Written by the `whatsapp-templates/*` Admin-SDK routes; status synced live by the QStash approval poll. |
| `broadcasts/{id}` | sub-account read; server-only write | Bulk-email batch metadata (template, audience filter, totals, status). One per "Send bulk email" action. |
| `broadcasts/{id}/sends/{contactId}` | sub-account read; server-only write | Per-recipient delivery row. Doc id = contactId for natural dedup. Status: queued/sent/skipped/failed. Carries Resend message id + error string. |
| `subAccounts/{id}/aiAgent/profile` | sub-account read; server-only write | Shared AI Agent identity. `systemPrompt`, `businessName`, `hoursStart/End`, `timezone`, `escalationKeywords`, `escalationNotifyEmail`, plus optional `websiteUrl` + `websiteKb` (Firecrawl snapshot, ≤6000 chars) + `websiteKbFetchedAt`. One per sub-account. |
| `subAccounts/{id}/aiAgent/{channelId}` | sub-account read; server-only write | Per-channel operational config. Channels today: `sms`, `web-chat`, `whatsapp`, `voice`. Carries `enabled`, `contextMessageCount`, `modelOverride`, `escalationKeywordsOverride`, `escalationNotifyEmailOverride`, `totalTokensUsed`. The `web-chat` doc nests a `webChat` block (`allowedDomains`, `welcomeMessage`, `accentColor`, `position`); the `whatsapp` doc nests `whatsapp` (`sessionWindowHours`); the `voice` doc nests `voice` (Vapi linkage + render prefs + the **Outbound** block: `outboundEnabled`, `outboundFirstMessage`, `outboundSystemPrompt`, `outboundWindow`, the per-minute/daily/per-number caps, `allowedCountries`). Outbound has no separate channel doc — it rides the `voice` doc. |
| `subAccounts/{id}/aiConfig/main` | sub-account read; server-only write | **Legacy.** Pre-refactor combined config. Kept readable so `lib/comms/ai/agent.ts::maybeMigrateLegacy()` can lazily split it into the new `aiAgent/profile` + `aiAgent/sms` shape on first read. Safe to remove after every sub-account has been migrated. |
| `subAccounts/{id}/webChatSessions/{sessionId}` | sub-account read; server-only write | One row per Web Chat thread. Anonymous-first — `contactId: null` until the bot captures identity. Carries `pageUrl`, `referrer`, `origin`, `visitorIp`, `visitorUserAgent`, `status` (active/closed/escalated), `messageCount`, `tokensUsed`, `capturedName/Email/Phone`, `capturePromptShownAt`, `captureSkipped`, `pendingFollowUpTaskId`. Session id = a UUID generated client-side and stored in localStorage. |
| `subAccounts/{id}/webChatSessions/{id}/messages/{id}` | sub-account read; server-only write | Per-turn transcript. `direction` inbound/outbound, `body`, `tokens`, `aiGenerated`. Visitor sees the body with any `[[capture …]]` / `[[form …]]` markers stripped. |
| `subAccounts/{id}/voiceCalls/{callId}` | sub-account read; server-only write | One summary doc per voice call (doc id = Vapi `call.id` for retry-dedup). Carries `direction` (`inbound` \| `outbound`), `callerPhone`, `toPhone`, `durationSec`, `summary`, `endedReason`, `contactId`, captured fields, `callbackRequested`, `taskId`, inline `transcript[]`, and live-status fields. Written by the Vapi end-of-call + status webhooks. |
| `voiceCampaigns/{campaignId}` | sub-account read; server-only write | Bulk Outbound Voice campaign (top-level, like `quotes`). Carries tenancy, `code` (`VC-YYYY-NNNN`), `name`, `audienceFilter` (reuses `BroadcastAudienceFilter`), `suppression`, `consentAck`, `status` (queued → calling → completed/cancelled/failed), and `totals` (audienceSize/queued/called/skipped/failed/interested). |
| `voiceCampaigns/{campaignId}/recipients/{contactId}` | sub-account read; server-only write | Per-recipient row — the QStash fan-out unit. Doc id = contactId. Carries `toPhone`/`toName` snapshot, `status` (queued/called/skipped/failed), `skippedReason`, `callId`, `callControlUrl` (for the stop-all kill switch), `outcome`, `callDurationSec`, `endedReason`, `callSummary`, `taskId`, `attempts`. Mirrors the bulk-email `broadcasts/{id}/sends` model. |
| `subAccounts/{id}/counters/voiceCampaignNumbers` | server-only | Per-sub-account sequence counter for the `VC-YYYY-NNNN` campaign code generator. Same atomic-increment shape as `quoteNumbers`. |
| `subAccounts/{id}/counters/quoteNumbers` | server-only | Per-sub-account sequence counter for the year-prefixed `Q-YYYY-NNNN` quote number generator. `{ year: number, seq: number, updatedAt }`. Atomic increment via Firestore transaction in `lib/quotes/number.ts::issueQuoteNumber()`. Never touched by clients — the resulting number returns in the create-quote API response. |
| `quotes/{id}` | sub-account read/create/update/delete | Operator-built quote. Carries tenancy (`agencyId`, `subAccountId`, `createdByUid`), `contactId`, `quoteNumber` (e.g. `Q-2026-0001`), `status` (draft → sent → viewed → accepted/declined/expired → paid), `currency`, `lineItems[]`, `globalDiscount`, `globalTaxPercent`, `termsAndNotes`, `billedToOrganization`, `validUntil`, `autoCreateDealOnAccept`, lifecycle stamps (`sentAt`, `viewedAt`, `acceptedAt`, `declinedAt`, `declineReason`, `declineNote`, `paidAt`), and `publicTokenHash` (SHA-256 of the most recent HMAC-signed public token — raw token never persisted). Edits allowed on sent quotes per v1 spec. |
| `socialPosts/{id}` | sub-account read; server-only write | Social Planner post (top-level, like `quotes`). Carries tenancy (`agencyId`, `subAccountId`, `createdByUid`), `caption`, `imageUrl`, `targets` (`("facebook"\|"instagram")[]`), `status` (draft → scheduled → publishing → published/failed), `scheduledAt`, `publishedAt`, per-target `results[]` (`{platform, status, externalId, error}`), and `qstashMessageId`. Reads stream to the content calendar via `subscribeToSocialPosts`; all writes go through Admin-SDK routes (rules are read-only for members, mirrors `products`). |

## Key Architecture
- **Firebase Client SDK** (`lib/firebase/client.ts`) — browser only
- **Firebase Admin SDK** (`lib/firebase/admin.ts`) — server only (`import "server-only"` guard)
- **Middleware** — protects every route except `PUBLIC_PATHS` (`/`, `/login`, `/signup`, `/terms`, `/privacy`, `/f/*`, `/api/forms/*`). Attaches `x-user-uid` + `x-user-email` to authenticated requests.
- **Comms routes** — `/api/comms/*` require auth; `requireUid()` + `requireContactOwner()` helpers in `lib/comms/route-auth.ts` enforce ownership before any send.
- **Public form submission** — `/api/forms/[id]/submit` uses admin SDK to bypass client-side Firestore rules; validates required fields, creates contact, optionally creates deal, writes `form_submitted` activity.
- **Activity timeline** — merges free-text notes + typed activities, sorted by `createdAt` desc. Icon + label mapped in `activity-timeline.tsx::activityVisuals()`.
- **Shared-sender comms** — user clicks Send email on a contact; Resend sends with `From: EMAIL_FROM` (verified LeadStack domain), `Reply-To: <user's email>`. Replies bypass LeadStack and land in the user's inbox.
- **Dedicated SMS per sub-account (opt-in)** — each sub-account can flip `twilioConfig.enabled = true` (Settings → SMS) and paste its own Twilio Account SID + Auth Token + From Number. When enabled: outbound `/api/comms/sms/send` uses that sub-account's creds; the inbound webhook routes by `To` number to that sub-account, validates against the sub-account's auth token, and writes both opt-out flips AND a chat-thread row to `contacts/{id}/messages`. The contact profile renders a Messages tab with a real-time SMS thread + composer. When disabled: existing env-var Twilio shared-sender behavior is fully preserved (no message storage, no chat thread). On save, the API auto-configures the inbound webhook URL on the operator's Twilio number via Twilio's REST API; if that fails (permissions, etc.) the settings UI surfaces the URL with a copy button for manual configuration. The inbound webhook ALSO drives the SMS AI agent when configured — see the AI Agents section below.
- **AI Agents (one persona, every channel)** — full architecture in the "AI Agents (Web Chat + SMS) v1" section below. TL;DR: a shared profile doc holds the persona, business hours, escalation keywords, and optional Firecrawl-scraped website KB. Per-channel docs hold the enabled toggle, model override, and channel-specific overrides. Web Chat ships an iframe widget + vanilla JS loader; SMS hooks into the existing inbound webhook. Captures auto-create a Task + send an escalation email.
- **Usage counters** — every `/send` bumps `usage/{uid}.email` / `.sms` + a `YYYY-MM` sub-bucket. No enforcement in MVP; hook for future plan-tier quotas.
- **Marketing attribution capture** — when a visitor hits a hosted form page at `/f/[id]`, [src/components/forms/public-form.tsx](src/components/forms/public-form.tsx) calls [src/lib/attribution.ts](src/lib/attribution.ts)::`readAttributionFromBrowser()` on mount to snapshot `utm_source/medium/campaign/content/term`, `fbclid`, `gclid`, `document.referrer`, and `window.location.href`. That snapshot is held in a `useRef` (so a post-submit URL rewrite doesn't lose it) and forwarded in the POST body to `/api/forms/[id]/submit`, which validates each field (≤500 chars, trimmed) via `normalizeAttribution()` and writes it to `contact.attribution`. `source` falls back to `utm_source` when set, otherwise the legacy `"website"`. After a successful submission, `trackLeadEvent()` fires a Meta Pixel `Lead` event client-side before any redirect — once the browser navigates the pixel script unloads with the page. **Iframe gotcha:** the captured URL is the iframe's URL, not the host page's (cross-origin blocks `window.parent.location`). Agencies embedding via iframe must encode UTMs in the iframe `src` for them to flow through.
- **Site-wide tracking scripts** — [src/app/layout.tsx](src/app/layout.tsx) conditionally loads Meta Pixel (when `NEXT_PUBLIC_META_PIXEL_ID` is set), Google Tag Manager (when `NEXT_PUBLIC_GTM_ID` is set), and Crisp Chat (when `NEXT_PUBLIC_CRISP_WEBSITE_ID` is set). All three follow the same `<Script strategy="afterInteractive">` pattern and ship `<noscript>` fallbacks where applicable (Pixel + GTM). Each is fully optional — leave the env unset to skip. GTM is the documented escape hatch for any tracker Pixel doesn't cover (LinkedIn Insight, TikTok Pixel, Hotjar, custom server-side gtag).
- **Crisp Chat as the support channel** — Crisp is wired site-wide via `NEXT_PUBLIC_CRISP_WEBSITE_ID`. The codebase deliberately routes every "talk to us" path through [src/lib/crisp.ts](src/lib/crisp.ts)::`openCrispChat()` instead of `mailto:` — pricing checkout-error fallback, the privacy-policy contact line. `openCrispChat()` is a typed no-op when the widget isn't loaded, so buyers who clone without configuring Crisp see broken-feeling but non-crashing buttons; document the env var prominently in their setup.

## Automations (Workflow Recipes v1)

LeadStack ships one named recipe — **Speed-to-Lead** (internal `recipeType: "instant_response"`) — that fires on form submission and sends up to three steps: SMS to lead, email to lead, and a static-recipient owner notification. v2 will add Lead Nurture, Pipeline Stage Trigger, Stale Lead Revive, and Booking Lifecycle (the last via cal.com / Calendly webhook integration).

- **Trigger** — [src/lib/automations/triggers.ts](src/lib/automations/triggers.ts) `fireTriggers()` is called from [src/app/api/forms/[id]/submit/route.ts](src/app/api/forms/[id]/submit/route.ts) after the contact is created. It queries enabled `automations` matching the trigger type + form id, creates an `automation_executions` row per match, and schedules step 0 via QStash.
- **Scheduling** — [src/lib/automations/qstash.ts](src/lib/automations/qstash.ts) wraps `@upstash/qstash`. Each step is a separate QStash message that POSTs `/api/automations/step` after the configured delay. Inbound callbacks verify the `Upstash-Signature` header before running anything; without verification keys configured, the route returns 503.
- **Step executor** — [src/lib/automations/executor.ts](src/lib/automations/executor.ts) loads the execution + automation + contact + template + sub-account + agency owner, runs three pre-flight checks (idempotency via `history`, contact opt-out, send-window), resolves merge tags, sends via Resend or Twilio, appends a history entry + activity row, and either schedules the next step or marks the execution complete. Failures during send are caught and logged to history with `success: false` rather than aborting; QStash 5xx triggers built-in retry.
- **Send-window** — stored on `subAccounts/{id}.sendWindow = { startHour, endHour, timezone }`. The executor checks current time in the configured zone via `Intl.DateTimeFormat`; outside the window, the same step gets republished to QStash with a fresh `nonce` for the next window start.
- **Opt-out compliance** — every email body must include `{{unsubscribeLink}}` (template editor enforces). The link is HMAC-signed (`AUTOMATIONS_TOKEN_SECRET`) and resolves to `/u/[token]` which POSTs `/api/u/[token]` to flip `contact.emailOptedOut = true`. Twilio inbound STOP/START is parsed by `/api/webhooks/twilio/inbound` (signature-verified against `TWILIO_AUTH_TOKEN`); matching contacts (lookup by phone) get `smsOptedOut` flipped. Twilio's webhook URL needs `/api/webhooks/twilio/inbound` configured under the number's "A MESSAGE COMES IN" setting.
- **Idempotency** — QStash retries on 5xx. The executor's first action is `if (execution.history.some(h => h.stepIndex === stepIndex)) return` so retries don't double-send.
- **Local dev** — QStash needs a public callback URL. Run `ngrok http 3000` and set `NEXT_PUBLIC_APP_URL` to the ngrok HTTPS URL while testing automations.

## Bulk email broadcasts (v1)

The contacts page exposes a **Send bulk email** action that fans out a chosen email template to a filtered audience (all contacts / a specific tag / a pipeline stage). Implementation reuses the automations infrastructure — same template engine, same merge tags, same QStash for fan-out, same `{{unsubscribeLink}}` opt-out path.

- **UI**: [src/components/contacts/bulk-email-dialog.tsx](src/components/contacts/bulk-email-dialog.tsx) lets the operator pick template + audience filter and shows a live recipients/skipped preview computed from the loaded contact list. Confirm posts to `/api/broadcasts/email/send` and routes to the broadcast detail page.
- **Send route**: [src/app/api/broadcasts/email/send/route.ts](src/app/api/broadcasts/email/send/route.ts) validates the template (must be type `email`, must contain `{{unsubscribeLink}}`), resolves the audience via [src/lib/broadcasts/audience.ts](src/lib/broadcasts/audience.ts) (pre-skips opted-out + missing-email contacts), creates the `broadcasts/{id}` parent doc + `sends/{contactId}` rows in 500-doc batches, and fans out to QStash with one staggered message per recipient at 5/sec (well under Resend's free-tier 10 req/sec cap). Hard-capped at 25,000 recipients per broadcast.
- **Step executor**: [src/app/api/broadcasts/email/step/route.ts](src/app/api/broadcasts/email/step/route.ts) is the QStash callback. Verifies signature, idempotency-checks the send row (status !== queued → ignore), re-checks `contact.emailOptedOut` live (operator could have flipped it mid-batch), renders merge tags, calls Resend, writes the row's status + atomically increments parent totals. Failed sends are recorded as `status: "failed"` and return 200 — one bounce never retry-storms the batch. The route is in `PUBLIC_PATHS`; security is the QStash signature.
- **List + detail pages**: `/sa/[id]/broadcasts` and `/sa/[id]/broadcasts/[broadcastId]` — onSnapshot-driven, so totals and per-recipient status update live as the fan-out drains.
- **Compliance**: every bulk email goes through the same `validateEmailBody` check that requires `{{unsubscribeLink}}` (CAN-SPAM). Per-recipient unsubscribe links resolve at `/u/[token]`, HMAC-signed with `AUTOMATIONS_TOKEN_SECRET`, flip `contact.emailOptedOut` on click. Pre-flight + live opt-out checks ensure opted-out contacts are never sent.
- **No SMS broadcasts in v1** — bulk SMS needs A2P 10DLC throughput awareness, consent-source audit fields, and TCPA-grade safeguards that are explicitly deferred to Phase 2.

## AI Agents (Web Chat + SMS) v1

A single AI agent powers multiple channels per sub-account. Shipped inbound channels: **Web Chat** (embeddable widget), **SMS** (auto-replies on the dedicated Twilio number), **WhatsApp** (auto-replies on the Twilio WhatsApp sender — beta), and **Voice** (Vapi-powered AI answering inbound calls). One shipped outbound channel: **Outbound Voice** (the AI proactively dials contacts — see "Outbound Voice channel" below). **Email** + **Google Business Profile** are scaffolded as hidden "coming soon" placeholders (`comingSoon: true, hidden: true` in [src/components/ai-agents/channels.ts](src/components/ai-agents/channels.ts) — their pages resolve if visited directly but they're omitted from the nav). The channel registry in `channels.ts` is the single source of truth for which channels exist + their shipped/coming-soon state.

### Data model — shared profile + per-channel configs

The pre-refactor layout had one combined doc per channel. The current model splits that into:

- **Profile** (`subAccounts/{id}/aiAgent/profile`) — the agent's identity. `systemPrompt`, `businessName`, `hoursStart/End`, `timezone`, `escalationKeywords[]`, `escalationNotifyEmail`. Plus the **website KB** fields: `websiteUrl`, `websiteKb` (markdown snapshot capped at ~6000 chars / ~1500 tokens), `websiteKbFetchedAt`.
- **Per-channel** (`subAccounts/{id}/aiAgent/{channelId}`) — operational toggles. `enabled`, `contextMessageCount`, `modelOverride`, `escalationKeywordsOverride` (null = inherit from profile), `escalationNotifyEmailOverride`, `totalTokensUsed`. The `web-chat` doc nests a `webChat: { allowedDomains, welcomeMessage, accentColor, position }` block; SMS leaves it null.

[src/lib/comms/ai/agent.ts](src/lib/comms/ai/agent.ts) `resolveAgent(subAccountId, channelId)` reads both in parallel and produces a `ResolvedAiAgent` with an `effective` block applying channel overrides. The orchestrators only consume `effective`. Lazy migration: `maybeMigrateLegacy()` runs on every read and silently splits the legacy `aiConfig/main` doc into the new shape one time per sub-account.

### LLM gateway — OpenRouter

[src/lib/comms/ai/openrouter.ts](src/lib/comms/ai/openrouter.ts) `callAi()` POSTs to OpenRouter's OpenAI-compatible chat endpoint. One key (`OPENROUTER_API_KEY`) covers every model the gateway exposes — Anthropic, OpenAI, Google, etc. Default is `anthropic/claude-haiku-4-5` (~$0.005-0.02 per SMS exchange); per-channel override lets premium tiers point at Opus 4.7. Returns `{ text, promptTokens, completionTokens, totalTokens, model }`. The deployment-wide default is `AI_REPLIES_DEFAULT_MODEL` (optional env var, falls back to Haiku).

### System prompt — channel-aware safety rails + KB

[src/lib/comms/ai/prompt.ts](src/lib/comms/ai/prompt.ts) `buildSystemPrompt()` is the single source of truth for the LLM system message. It composes 4 sections: persona (from profile) → channel-specific safety rails → website KB block (when populated) → contact context block (when a contact is identified). Both SMS and Web Chat orchestrators AND the "Test this persona" dry-run endpoint use it, so what you preview matches what the bot actually receives.

Safety rails differ per channel:
- **SMS**: ≤320 chars, no emoji, no markdown, no specific prices/medical/legal commitments.
- **Web Chat**: 1-3 short paragraphs, light markdown allowed, at most one emoji per reply, plus instructions for the `[[form fields="…"]]` and `[[capture …]]` lead-capture markers (see "Lead capture" below).

The KB block tells the model: "Use this as factual reference only — never quote raw markdown or links. Outside this content, fall back to 'let me check with the team'."

### Website KB — Firecrawl

[src/lib/firecrawl/client.ts](src/lib/firecrawl/client.ts) `scrapeUrl(url)` POSTs to `https://api.firecrawl.dev/v1/scrape` with `formats: ["markdown"], onlyMainContent: true`. 30s timeout. Returns markdown + the page title. `POST /api/sub-accounts/[id]/ai-agent/profile/refresh-kb` is admin-only and calls Firecrawl with the profile's saved `websiteUrl`, stores the result (capped at 6000 chars), and stamps `websiteKbFetchedAt`. Failure leaves the previous snapshot intact. The profile route auto-clears the KB whenever `websiteUrl` changes so the bot can't quote a stale site.

Firecrawl is **optional** — the bot works without it, just without homepage factual context. Single-page scrape only in v1; multi-page crawl was considered and rejected for v1 (cost scales fast, signal-to-noise drops). One agency-level key shared across all sub-accounts.

### SMS channel

[src/lib/comms/ai/respond.ts](src/lib/comms/ai/respond.ts) `maybeRespondWithAi()` is the SMS orchestrator. Invoked from [src/app/api/webhooks/twilio/inbound/route.ts](src/app/api/webhooks/twilio/inbound/route.ts) ONLY when the inbound is in dedicated-Twilio mode AND `aiIsConfigured()` AND the resolved agent's `effective.enabled` is true. Pre-flight guards: contact opted-out → skip, empty persona → skip, outside hours → skip, escalation keyword in message → email + skip. Else loads recent message history + the contact context block, builds the system prompt, calls the LLM, sends via Twilio's `sendSmsForSubAccount()`, persists the outbound message + activity row + increments the channel's token counter.

The orchestrator is **channel-agnostic via a transport** (`getChannelTransport()` in `respond.ts`): SMS and WhatsApp share the same guards → context → LLM → send → log flow, differing only in the message-thread subcollection (`messages` vs `whatsappMessages`), the opt-out flag (`smsOptedOut` vs `whatsappOptedOut`), the provider send fn, and the activity label. Web Chat + Voice have their own orchestrators and never call `maybeRespondWithAi`.

### WhatsApp channel — Twilio (session messaging, v1)

WhatsApp is delivered over Twilio and **reuses the sub-account's existing dedicated Twilio credentials** (the same `accountSid` + `authToken` as SMS) plus a dedicated WhatsApp sender number stored on `twilioConfig.whatsappFromNumber` (+ optional `twilioConfig.whatsappSandbox` for testing via Twilio's shared sandbox). Configured under Settings → SMS (a "WhatsApp sender" sub-panel), managed by `POST/DELETE /api/sub-accounts/[id]/twilio/whatsapp`.

- **Gated three ways before it'll reply:** the agency `whatsappEnabledByAgency` gate, a configured WhatsApp sender (`subAccountWhatsappIsConfigured()`), and a non-empty persona prompt (shared with every channel). The channel settings live at AI Agents → WhatsApp ([whatsapp-channel-section.tsx](src/components/ai-agents/whatsapp-channel-section.tsx)); the channels API route adds the agency-gate 403 + sender 400 on enable.
- **Inbound:** [src/app/api/webhooks/twilio/whatsapp/inbound/route.ts](src/app/api/webhooks/twilio/whatsapp/inbound/route.ts) — dedicated-only (no shared-env fallback). Strips the `whatsapp:` address prefix, resolves the sub-account by `whatsappFromNumber`, enforces the agency gate, validates the Twilio signature, flips `whatsappOptedOut` on STOP/START, stores inbound to `contacts/{id}/whatsappMessages/{sid}`, and dispatches `maybeRespondWithAi({channelId: "whatsapp"})`. Unlike SMS dedicated mode, an inbound from an **unknown** number auto-creates a Contact (phone-first, name from the Twilio `ProfileName` param, `source: "whatsapp"`, via `createContactServerSide` so `contact.created` fires) and then replies — so a public "Contact Us on WhatsApp" link captures brand-new leads. The lone exception: a never-seen number whose *first* message is STOP/START is dropped without minting a contact.
- **Safety rails:** `buildSafetyRails()` has a `whatsapp` branch — richer than SMS (emoji ok, `*single-asterisk*` bold, longer messages) but markerless (the reply is sent verbatim; no `[[capture]]` parsing on this channel).
- **Manual send + 24h window:** the contact profile renders a WhatsApp thread ([contact-whatsapp-thread.tsx](src/components/contacts/contact-whatsapp-thread.tsx)) when a sender is configured + the agency gate is on. Operators reply via [/api/comms/whatsapp/send](src/app/api/comms/whatsapp/send/route.ts), which enforces WhatsApp's **24-hour session window** (free-form sends only within 24h of the contact's last inbound; 409 otherwise). Re-opening a closed window needs an approved message template — explicitly **deferred to v2** (no template manager, no proactive/automation/broadcast WhatsApp sends in v1). The AI auto-reply path doesn't need the window guard — it only ever responds to a just-received inbound.

### WhatsApp message templates (v2 foundation — BUILT)

Templates are Meta-pre-approved messages — the only compliant way to start or re-open a WhatsApp conversation outside the 24h window. Twilio is the BSP, so submission is API-driven via Twilio's **Content API** (`content.twilio.com`, authed with the sub-account's own Twilio creds — the operator never touches Meta Business Manager). Meta makes the approval decision; we relay + poll for it.

**Built (foundation):**

- **Storage:** `subAccounts/{id}/whatsappTemplates/{id}` ([src/types/whatsapp-templates.ts](src/types/whatsapp-templates.ts)) — body with positional `{{1}}` variables, each variable carrying a `source` (`merge_tag` | `manual`), a mapped merge tag, and a sample value; plus `contentSid`, `status` (`draft → submitting → pending → approved | rejected | failed | paused | disabled`), `rejectionReason`, and poll bookkeeping.
- **Content API wrapper:** [src/lib/comms/whatsapp/templates-api.ts](src/lib/comms/whatsapp/templates-api.ts) — `createContentTemplate` / `submitForWhatsappApproval` / `fetchApprovalStatus` via REST + Basic auth (SDK-version-independent). `sendWhatsappTemplateForSubAccount` in [twilio.ts](src/lib/comms/twilio.ts) sends an approved template via `messages.create({ contentSid, contentVariables })`.
- **Routes:** CRUD at `/api/sub-accounts/[id]/whatsapp-templates` (+ `/[templateId]` PATCH/DELETE, drafts/rejected/failed only) and `/[templateId]/submit` (creates the Content + approval request, schedules the first poll). The approval **poll** at `/api/sub-accounts/[id]/whatsapp-templates/poll` is a QStash signature-verified callback mirroring the website-builder poll, with a backoff tail (20s for ~5 min, then 5-min ticks out to ~4h). Added to middleware `PUBLIC_PATH_PATTERNS`. All gated by the agency WhatsApp gate + a configured sender + admin.
- **Starter gallery:** [src/lib/comms/whatsapp/starter-templates.ts](src/lib/comms/whatsapp/starter-templates.ts) — 7 curated, policy-clean starters mapped to existing features (Lead acknowledgement, Booking confirmation/reminder, Quote ready, Payment reminder, Re-engagement, Review request). Selecting one pre-fills the builder; each still goes through Meta approval. Marketing starters carry a `Reply STOP to opt out` footer.
- **Variable → merge-tag mapping:** [src/lib/comms/whatsapp/resolve-template-variables.ts](src/lib/comms/whatsapp/resolve-template-variables.ts) resolves `merge_tag` variables against the contact (reusing the automation `resolveMergeTags` subject); `manual` variables are typed at send time. Sample values are submitted to Meta for review.
- **UI:** template manager at `/sa/[id]/ai-agents/whatsapp/templates` ([whatsapp-templates-manager.tsx](src/components/ai-agents/whatsapp-templates-manager.tsx)) — gallery + builder + live status list (onSnapshot). The contact WhatsApp thread gains a "Send template" panel ([whatsapp-template-sender.tsx](src/components/contacts/whatsapp-template-sender.tsx)) → `/api/comms/whatsapp/send-template`, the compliant way to message a contact whose 24h window has closed.

**NOT built (later passes, deliberately deferred):** templates in **automations** (a `whatsapp_template` step — also needs the recipe engine extended past `instant_response`) and **broadcasts** (a bulk WhatsApp-template channel mirroring email broadcasts). Also: media/header/button templates (v2 foundation is text-only) and editing of *approved* templates (Meta makes them immutable — create a new one). The session-only v1 inbound/freeform path is untouched — templates are purely additive.

### Facebook Messenger + Instagram DM inbox (BETA — two-way)

Two unified-inbox channels delivered over the Meta Graph API. **Agency-gated + off by default** via `metaInboxEnabledByAgency` (see the feature-gates table) — the entire surface stays invisible until the agency flips it on for a sub-account. Both channels ride **one** Meta connection (a Facebook Page + its linked Instagram business account), so they're connected/disconnected together.

> **ONE shared connection.** The inbox AND the Social Planner ride the **same** `metaConfig` record (one Page, one token). There is exactly one connect/disconnect surface — the **"Facebook & Instagram"** card in Settings — and `metaConfig.capabilities = { inbox, publish }` records what the stored token can actually do, so the two features never disagree. Do NOT add a second connect flow for a new Meta feature; extend the scopes + capabilities instead. See "Social Planner v1".

- **Connection model:** per-sub-account `subAccountDoc.metaConfig` ({@link MetaConfig} in [src/types/tenancy.ts](src/types/tenancy.ts)) holds the Page id/name, long-lived Page access token (stored like `twilioConfig.authToken`), linked IG account id/handle, and **`capabilities: { inbox, publish }`** — derived at connect time from the permissions Meta actually GRANTED (`/me/permissions`) intersected with the agency gates that were on. Helpers `metaCanInbox()` / `metaCanPublish()` live in the client-safe [src/lib/comms/meta-capabilities.ts](src/lib/comms/meta-capabilities.ts) (kept out of the `server-only` `meta.ts` so client components can import them). Legacy connections (pre-capabilities) read `inbox` as true (it worked) and `publish` as false (must reconnect to gain posting). Populated by the OAuth callback; null until connected.
- **Connect flow (shared, gate-aware):** [src/app/api/sub-accounts/[id]/meta/connect/route.ts](src/app/api/sub-accounts/[id]/meta/connect/route.ts) (admin-only; allowed when **EITHER** the inbox gate **OR** the Social gate is on + `metaAppConfigured()`, then redirects to Facebook Login with an HMAC-signed `state`). Scopes are built by `metaScopeList({ publish })` — the inbox/base scopes always, **plus** `pages_manage_posts` + `instagram_content_publish` only when the Social gate is on. → [.../meta/callback/route.ts](src/app/api/sub-accounts/[id]/meta/callback/route.ts) (verifies state, exchanges the code for a Page token, calls `getGrantedScopes()` + `deriveMetaCapabilities()` to stamp capabilities, subscribes the Page to our webhook, writes `metaConfig`) → redirects back to Settings with a `?meta=…` status the card toasts. Disconnect: `DELETE .../meta` clears `metaConfig` (best-effort webhook unsubscribe; history + scheduled posts kept) — **removes both the inbox AND posting**, which is why the Social Planner tab is read-only and points here.
- **Inbound webhook:** [src/app/api/webhooks/meta/route.ts](src/app/api/webhooks/meta/route.ts) — GET is the verify-token handshake; POST verifies `X-Hub-Signature-256` (HMAC of the raw body with the app secret), routes by Page id (Messenger) / IG account id (Instagram), **re-enforces the agency gate**, reconciles/creates a Contact by `contact.metaUserId` (Meta DMs carry no phone/email; `source: "facebook" | "instagram"`), writes the inbound to `contacts/{id}/metaMessages` (channel-discriminated subcollection), and updates the unified-inbox index via the shared `upsertConversationForMessage()`. Public path; always 200 so Meta doesn't retry-storm. Echoes + non-text events are ignored.
- **Outbound (reply):** [src/app/api/comms/meta/send/route.ts](src/app/api/comms/meta/send/route.ts) — manual reply from the inbox. Mirrors the WhatsApp send route: re-enforces the agency gate, requires a connected Page (+ linked IG for Instagram) and a `contact.metaUserId`, enforces Meta's **24-hour standard messaging window** (409 `session_window_closed` outside it — message tags are a later release), sends via `sendMetaMessage()`, then writes the outbound `metaMessages` row + a `messenger_sent`/`instagram_sent` activity + the inbox index (`pauseBot`). The composer ([conversation-composer.tsx](src/components/conversations/conversation-composer.tsx)) posts here with `{contactId, body, channel}`; `availableChannels` adds messenger/instagram only when the gate's on, a Page is connected, the contact has a `metaUserId`, and that channel is in the conversation's `channelsSeen`. The thread ([conversation-thread.tsx](src/components/conversations/conversation-thread.tsx)) merges `metaMessages` alongside SMS/WhatsApp.
- **Lib:** [src/lib/comms/meta.ts](src/lib/comms/meta.ts) (`server-only`) — `metaAppConfigured()`, `metaScopeList({ publish })`, OAuth URL + signed `state`, `X-Hub-Signature-256` verification, code→token exchange, `me/accounts` page listing, `getGrantedScopes()` (`/me/permissions`), page (un)subscribe, profile-name lookup, `sendMetaMessage()`, and the Social Planner publish helpers `publishToFacebookPage()` / `publishToInstagram()`. Graph version pinned `v21.0`. Pure capability helpers (`metaCanInbox` / `metaCanPublish` / `deriveMetaCapabilities`) live in the client-safe [src/lib/comms/meta-capabilities.ts](src/lib/comms/meta-capabilities.ts).
- **Settings UI:** [src/components/settings/sub-account-meta-section.tsx](src/components/settings/sub-account-meta-section.tsx) under Settings — the unified **"Facebook & Instagram"** card. **Self-gating** — early-returns `null` unless the caller is admin AND **at least one** Meta gate (inbox or Social) is on. The single connect/reconnect/disconnect surface for everything Meta on the sub-account; shows the connected Page + IG handle, **capability badges** (Inbox / Posting, each enabled-or-not-granted from `metaConfig.capabilities`), and the webhook URL + OAuth redirect URI to register in the Meta app. The Social Planner's Connections tab is a read-only mirror that deep-links here.
- **Identity / merge:** a Messenger/IG DM only yields a page-scoped id (`metaUserId`), so a sender already in the CRM (by email) becomes a *second, Meta-only* contact (`source: facebook/instagram`, brand-coloured badge). A **scoped "Link to existing contact"** action ([link-contact-button.tsx](src/components/contacts/link-contact-button.tsx) on the profile header, admin-only, shown only when `metaUserId` is set) merges the stub into a chosen existing contact: [POST /api/contacts/[id]/link](src/app/api/contacts/[id]/link/route.ts) moves the stub's message subcollections, re-points every record that referenced it (deals/tasks/events/quotes/submissions/web-chat/voice — same set as the delete guard), merges the inbox conversation index, stamps `metaUserId` onto the survivor, and recursively deletes the stub. Blocks if the target already has a *different* `metaUserId` (409). A general any-to-any merge is still deferred.
- **Firestore rules:** `contacts/{id}/metaMessages` is member-read / `readAt`-only-update / server-only-create — same shape as `messages` + `whatsappMessages`. **Run `firebase deploy --only firestore:rules` after pulling this** or the thread's client read of `metaMessages` is denied (thread shows empty for FB/IG).
- **Env:** `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` (optional — absent → the card shows "not configured on this deployment"; OAuth `state` reuses `AUTOMATIONS_TOKEN_SECRET`).
- **NOT yet (deferred):** AI auto-reply on Messenger/IG (the orchestrator is channel-agnostic but the inbound webhook doesn't dispatch it yet), out-of-window sends via message tags / `HUMAN_AGENT`, multi-Page selection (connect picks the first managed Page), and rich media (text only). The hard external dependency remains **Meta App Review**; all code degrades gracefully until creds exist.

### Web Chat channel — widget + iframe architecture

The widget is a 4KB hand-written vanilla JS loader at [public/widget.js](public/widget.js). The snippet that goes on the client's site is one line (the Web Chat settings page generates it for the operator with the current deployment's URL baked in):

```html
<script src="https://YOUR-DEPLOYMENT-DOMAIN/widget.js" data-sa="sa_xxx" async></script>
```

What the loader does, in order:
1. Reads `data-sa` from its own `<script>` tag and derives the LeadStack origin from its own `src`.
2. `GET /api/web-chat/config?sa=…` to fetch theme + welcome + enabled state. **This** call's Origin header IS the client's site (called from parent-page context), so this is the request the per-sub-account `allowedDomains` allowlist gates. When the origin isn't allowed, the endpoint returns 200 + `{enabled: false}` (no console error) and the loader silently no-ops.
3. Injects a fixed-position floating bubble button using inline styles (no CSS dependencies).
4. On click → lazy-creates an `<iframe src="/embed/chat/[saId]?p=<parentURL>">` and fades it in. The iframe stays in the DOM after close, just hidden via `display:none`, so reopens are instant and preserve state.

The iframe target is a real Next.js page at [src/app/(embed)/embed/chat/[subAccountId]/page.tsx](src/app/(embed)/embed/chat/[subAccountId]/page.tsx) wrapped in a minimal layout that bypasses dashboard chrome. Renders [src/components/web-chat/chat-window.tsx](src/components/web-chat/chat-window.tsx) — fully self-contained with inline styles + a `<style>` block, immune to host-page CSS bleed.

**postMessage** is used in one direction only: iframe → parent for `{type: "close"}` events when the visitor clicks the X. The loader responds by fading the iframe out.

**Cross-origin headers** are configured in [next.config.ts](next.config.ts): `Content-Security-Policy: frame-ancestors *;` on `/embed/*` so any third-party site can iframe it, and `Access-Control-Allow-Origin: *` + a 5-minute cache on `/widget.js`. Both the `/embed/*` route group and `/api/web-chat` are added to `PUBLIC_PATHS` in middleware.

**Crisp-skip:** the root layout's analytics scripts (Crisp, Pixel, GTM) live in [src/components/analytics-scripts.tsx](src/components/analytics-scripts.tsx) which checks `usePathname()` and returns null on `/embed/*`. Without this skip, Crisp's own chat widget would render INSIDE the LeadStack chat iframe — visually broken.

### Web Chat API + security model

Three public endpoints under `/api/web-chat`:
- **`GET /api/web-chat/config?sa=…`** — origin-gated (this is the access control choke-point). Returns theme + welcome.
- **`POST /api/web-chat/message`** — visitor → bot turn. **No origin check** — the iframe is always on LeadStack's domain, so the Origin header would always be our own host, making the check useless. Instead: channel-enabled check, valid sessionId (16-64 char URL-safe regex), 1-2000 char message length, per-IP cap (60/hour) + per-session cap (30 messages) via in-memory LRU in [src/lib/comms/web-chat/rate-limit.ts](src/lib/comms/web-chat/rate-limit.ts), plus the per-channel `totalTokensUsed` counter that caps disaster scenarios. A motivated attacker who scrapes a `data-sa` could call this endpoint directly, but the rate limits + token budget make it uneconomical. If abuse is ever observed, the next step is HMAC-signed tokens issued by `/config` and required by `/message`.
- **`POST /api/web-chat/capture`** — the inline-form submission endpoint (see Lead capture below).

All three respond with CORS headers (`Access-Control-Allow-Origin: *`) so the iframe's fetches never throw a console error.

### Lead capture — two marker mechanisms

The bot can emit one of two markers at the end of its reply when it needs contact details:

**`[[form fields="name,email,phone"]]` (preferred)** — Server strips the marker, returns `formFields` in the `/message` response. Widget renders an inline form below the bot bubble with the requested fields, plus a Skip button. On submit, `POST /api/web-chat/capture` validates email + phone, calls `reconcileContactFromCapture()` (email-match within sub-account wins, otherwise creates a new `source: "web-chat"` Contact), links `session.contactId`, returns a templated thank-you (no extra LLM call), and triggers the follow-up pipeline.

**`[[capture name="…" email="…" phone="…"]]` (fallback)** — Used when the visitor volunteered details in free text without being asked. Bot extracts them, server strips the marker + runs the same reconciliation. No form rendered.

**One-shot enforcement** — Once `session.contactId` is set OR `session.capturePromptShownAt` is stamped, the orchestrator suppresses re-emission server-side (even if the LLM ignores instructions) AND injects a `--- SESSION STATE ---` block into the system prompt telling the model not to ask again.

### Follow-up pipeline on capture

Every successful capture triggers [src/lib/comms/web-chat/follow-up.ts](src/lib/comms/web-chat/follow-up.ts) `createFollowUpActions()`, which is best-effort and never blocks the visitor's thank-you reply:

1. **Task** — creates a row in the `tasks` collection: title `"Follow up with [identity] from Web Chat"`, due end-of-today, `contactId` set, notes carry the captured fields + last visitor message + page URL. The id is stamped onto `session.pendingFollowUpTaskId`.
2. **Email** — sends to `escalationNotifyEmail` (channel override wins, else profile default) via Resend. HTML template with the captured details, latest message blockquote, and CTAs deep-linking to the session detail + contact record. Plain-text fallback included for previews.

Failures are logged + returned in the response's `errors` array but never throw. If the escalation email isn't configured, the Task still creates.

### Operator console

`/sa/[id]/ai-agents/web-chat/sessions` (list) and `/sa/[id]/ai-agents/web-chat/sessions/[sessionId]` (detail). Both subscribe to Firestore via `onSnapshot` so new sessions appear + transcripts update live as visitors chat. The list shows filter pills (All / Pending follow-up / Captured / Anonymous / Escalated) with live counts. Each row subscribes to its linked Task and shows a "Pending follow-up" (amber) or "Followed up" (green) badge that flips automatically when the operator marks the task done. The detail page renders a session header (identity + contact deep-link + page URL + status), a follow-up task card with Mark done / Reopen buttons, and the transcript with visitor / bot / form-submission bubbles distinguished.

Phase 2's operator takeover (operator types into the visitor's widget mid-conversation) is **not** shipped — the console is read-only. Building it would require: an outbound-from-dashboard message endpoint that bypasses the LLM, a "bot silenced" session flag, and onSnapshot listening inside the visitor's iframe.

### Contact source

When a Web Chat capture creates a new Contact, `source: "web-chat"` is stamped. The [src/components/contacts/source-badge.tsx](src/components/contacts/source-badge.tsx) renders this as a violet "Web Chat" pill. Form submissions write `source: "website-form"` (blue), distinct from the legacy `"website"` (sky, used by older contacts + as a manual catch-all in the contact-form dropdown). Voice captures stamp `source: "voice"` — see the Voice channel section below.

### Voice channel — Vapi BYOC

The voice channel adds AI-answered inbound phone calls on the same dedicated Twilio number the sub-account already uses for SMS. Vapi handles the realtime audio pipeline (STT via Deepgram, TTS via the configured voice, sub-300ms turn-taking, barge-in); per-turn LLM decisions stream back to our own endpoint so every voice reply runs through the same `resolveAgent()` + `buildSystemPrompt()` + OpenRouter path SMS and Web Chat use. Zero persona drift across channels.

**Two `numberMode` options.** The Voice settings page exposes a radio that chooses between:

- **`twilio-byoc` (default, production)** — Voice attaches to the sub-account's existing dedicated Twilio number via Vapi BYOC. One number serves SMS + Voice with one Twilio bill. The provisioning side-effect (1) creates/updates a Vapi **assistant** wired to our LLM endpoint, and (2) creates a Vapi **phone-number** resource bound to the operator's Twilio creds — Vapi auto-updates Twilio's "A CALL COMES IN" voice URL as part of the BYOC registration, no separate Twilio webhook step. SMS continues to flow through the existing `/api/webhooks/twilio/inbound` route unchanged. Disable tears down both the assistant + phone-number resources (we own both) so idle configs don't accrue Vapi spend.
- **`vapi-managed` (testing)** — Voice attaches to a phone-number resource the operator already provisioned in their Vapi dashboard. Useful for skipping AU regulatory bundles when testing, or for operators who'd rather pay Vapi directly than chain through Twilio. The operator pastes the Vapi phone-number ID into the settings UI; the provisioning side-effect just PATCHes that resource to bind our LeadStack-managed assistant (replacing any previously-assigned assistant). Disable deletes the assistant but only **unbinds** the phone-number (sets `assistantId: null`) since the operator owns it — and preserves the pasted id on the channel doc so re-enable doesn't require re-pasting.

Both modes share the rest of the pipeline identically: same persona/KB resolution, same LLM webhook, same end-of-call handler, same `voiceCalls/{callId}` summary docs. Only the phone-number resource ownership differs.

**The three webhook endpoints.** All sit under `/api/webhooks/vapi/` and are gated by `Authorization: Bearer ${VAPI_WEBHOOK_SECRET}` (set on each assistant during provisioning so Vapi sends it on every callback). Public paths in middleware because security is the header check, not the session cookie.

- **`POST /api/webhooks/vapi/llm/[subAccountId]`** — Vapi's custom-LLM endpoint. Exposes an OpenAI-compatible chat-completion shape; Vapi POSTs every turn. We ignore Vapi's composed system message and replace it with our own `buildSystemPrompt({channelId: "voice"})`. Returns non-streaming JSON (Haiku 4.5 is fast enough; streaming SSE is a future add). Looks up an existing Contact by caller-ID phone for context injection.
- **`POST /api/webhooks/vapi/end-of-call/[subAccountId]`** — fired once per call after Vapi's post-call analysis pass completes. Delegates to [src/lib/comms/voice/end-of-call.ts](src/lib/comms/voice/end-of-call.ts), which reconciles a Contact (phone-first match strategy — caller ID is always present) + creates the Task + sends the escalation email + writes a `voiceCalls/{callId}` summary doc. Always returns 200 so Vapi doesn't retry into duplicate Tasks/emails.
- **`POST /api/webhooks/vapi/status/[subAccountId]`** — thin lifecycle handler. Stamps live call status onto the in-flight summary doc; foundation for a live operator console.

**System prompt — voice safety rails.** [src/lib/comms/ai/prompt.ts](src/lib/comms/ai/prompt.ts)::`buildSafetyRails()` has a voice-channel branch with rules tuned for spoken conversation: 1-2 sentence replies, no markdown / emoji / URLs / character-spelled-out emails, natural conversational fillers, and a lead-capture trigger list adapted for callers ("can someone call me back", "I'd like a quote", etc.). The capture marker is the same `[[capture name="…" phone="…" email="…"]]` the web-chat channel uses — no new marker syntax. The caller's phone is implicit from caller ID; the bot only emits an explicit `phone=` if the caller asked for a callback on a different number.

**Lead capture — shared with Web Chat.** [src/lib/comms/ai/capture.ts](src/lib/comms/ai/capture.ts) and [src/lib/comms/ai/follow-up.ts](src/lib/comms/ai/follow-up.ts) hold the channel-agnostic reconciliation + Task/email pipeline that both Voice and Web Chat use. Web Chat reconciles email-first (visitors type emails deliberately); Voice reconciles phone-first (caller ID is always durable). The reconciler accepts a `source` param so contacts created via voice get `source: "voice"` and via web-chat get `source: "web-chat"`. Task title differs by channel — "Call back X from Voice" vs "Follow up with X from Web Chat" — driven by the `channelLabel` / `taskAction` props on `createCaptureFollowUp`.

**Data model.** `subAccounts/{id}/aiAgent/voice` carries the standard `AiChannelConfig` fields plus a nested `voice: VoiceChannelConfig` block (`greeting`, `voiceProvider`, `voiceId`, `maxCallSeconds`, `vapiAssistantId`, `vapiPhoneNumberId`). The two Vapi linkage ids are server-managed — the operator can't set them via PATCH; they're populated by the provisioning round-trip when the channel is enabled and cleared when it's disabled. `subAccounts/{id}/voiceCalls/{callId}` (doc id = Vapi callId for natural retry-dedup) carries one summary doc per call: caller phone, duration, summary, ended reason, contactId, callbackRequested flag, captured fields, link to the created Task. No turn-by-turn transcript or audio per the v1 spec.

**Gates that prevent silent failure.** Enabling voice requires: (1) agent persona prompt non-empty (shared with SMS/Web Chat), (2) `VAPI_API_KEY` + `VAPI_WEBHOOK_SECRET` + `NEXT_PUBLIC_APP_URL` all set, and (3) the active `numberMode`'s phone-number prerequisite — `twilio-byoc` needs `subAccount.twilioConfig.enabled === true`, `vapi-managed` needs a non-empty `vapiPhoneNumberId` on the saved voice block. Any missing gate returns a 400/503 with a friendly error from the channels API; the operator can't bypass via direct API calls.

### Outbound Voice channel — operator-initiated AI calls

Everything above answers calls **coming in**. Outbound Voice flips the direction: the AI proactively **dials contacts**. It reuses the same provisioned Vapi assistant + phone number as inbound Voice (no second number, no second bill) but runs a different persona, a different first message, and — critically — a native **dialing-compliance gate** before any call is placed. Two entry points: a single click-to-call from a contact, and a bulk campaign over a filtered audience. Surfaced at **AI Agents → Outbound Voice** ([src/components/ai-agents/outbound-voice-section.tsx](src/components/ai-agents/outbound-voice-section.tsx)) plus a call button on the contact-profile header.

**Outbound persona + config.** The `voice` channel doc's nested `VoiceChannelConfig` block carries an outbound section distinct from the inbound greeting: `outboundEnabled` (master switch, independent of inbound `enabled`), `outboundFirstMessage` (what the agent says when the contact picks up — "thanks for calling" makes no sense outbound), `outboundSystemPrompt` (a proactive-conversation persona; falls back to the shared profile persona when blank — the LLM webhook swaps it in when the call metadata marks the call outbound), `outboundWindow` (calling hours, evaluated in the **contact's** local timezone), the three caps (`outboundPerMinuteCap`, `outboundDailyCap`, `outboundPerNumberPerDay`), and `allowedCountries` (optional ISO-3166 alpha-2 allow-list; null = allow all — no US-only assumptions).

**Native compliance gate.** [src/lib/comms/voice/outbound-compliance.ts](src/lib/comms/voice/outbound-compliance.ts)::`checkOutboundCompliance()` runs before any call is placed, so a blocked call spends **zero** Vapi minutes. Checks in order: valid E.164 phone → `contact.voiceOptedOut` (a **separate** flag from `smsOptedOut`) → per-call `consentAck` (Phase 1 consent model — the operator affirms consent at launch) → optional country allow-list → calling window in the contact's timezone (defers the call to the next window rather than dropping it) → durable daily-cap + per-number-frequency check (Firestore count of the last 24h of outbound `voiceCalls`) → in-memory per-minute burst limiter → a **pluggable third-party scrub provider** ([compliance-provider.ts](src/lib/comms/voice/compliance-provider.ts), no-op by default — buyers add a regional DNC/scrub service by implementing one method). First failing check blocks with a machine-readable `code` + human `reason`.

**Single click-to-call.** [src/app/api/comms/voice/call/route.ts](src/app/api/comms/voice/call/route.ts) — auth + can-access-contact → agency gate `outboundVoiceEnabledByAgency === true` (403) → `voice.outboundEnabled === true` (403) → Vapi configured + provisioned (503/400) → compliance gate (422 with `code`/`reason`). On success it places the call via the shared assistant, writes a `voiceCalls/{callId}` placeholder (`direction: "outbound"`, linked to the contact, so the caps count it + the console shows it) + a `voice_call_initiated` activity row. A separate [src/app/api/comms/voice/test-call/route.ts](src/app/api/comms/voice/test-call/route.ts) lets the operator dry-run their own number.

**Bulk campaigns.** Mirrors the bulk-email broadcasts model exactly. [src/app/api/comms/voice/campaign/send/route.ts](src/app/api/comms/voice/campaign/send/route.ts) resolves an audience (reuses `BroadcastAudienceFilter` — all / tag / pipeline-stage — plus optional suppression: recently-called, an excluded prior campaign, or an excluded tag), issues a `VC-YYYY-NNNN` code, creates the `voiceCampaigns/{id}` parent + `recipients/{contactId}` rows in batches, and fans out to QStash one staggered message per recipient at the sub-account's per-minute cap (hard-capped 25k/campaign). [campaign/step/route.ts](src/app/api/comms/voice/campaign/step/route.ts) is the QStash callback — one recipient → the compliance gate → place the call, skip (records `skippedReason`), or defer to the calling window. [campaign/cancel/route.ts](src/app/api/comms/voice/campaign/cancel/route.ts) is the "stop all" kill switch: it flips the campaign to `cancelled` and uses each live row's `callControlUrl` (Vapi `monitor.controlUrl`) to end in-flight calls. Per-recipient row transitions drive the parent `totals` via `FieldValue.increment()`. Operator console: **AI Agents → Outbound Voice → Campaigns** (list + `[campaignId]` per-recipient status), onSnapshot-live like broadcasts.

**Outcome + hot-lead follow-up.** When a campaign call completes, the Vapi end-of-call handler sets the recipient's `outcome` (`interested` / `not_interested` / `callback` / `no_answer` / `voicemail` / …) from Vapi's structured-data extraction. An `interested` outcome bumps the campaign's `totals.interested` headline metric and creates a follow-up Task (same Task + escalation pipeline the inbound channels use). Contacts created/reconciled from outbound calls carry the existing `source: "voice"`.

**Setup contract — no new env vars.** Outbound reuses the inbound Voice stack: `VAPI_API_KEY` + `VAPI_WEBHOOK_SECRET` (calls), `QSTASH_*` (campaign fan-out), `NEXT_PUBLIC_APP_URL` (the LLM webhook URL Vapi calls per turn), the sub-account's dedicated Twilio number (BYOC). The agency owner flips `outboundVoiceEnabledByAgency` on; the sub-account operator flips `voice.outboundEnabled` on; the scrub provider is a no-op unless the buyer wires one. Cost is the same per-minute Vapi + per-token OpenRouter footprint as inbound — but spent proactively, which is exactly why it's independently agency-gated.

## Quotes v1

GHL-style "Estimates" — operator builds a line-itemed quote inside a contact (or via the standalone Quotes tab), sends via branded email, recipient views + accepts/declines on a public landing page. **No inline payment collection in v1** — operator marks paid manually after receiving payment off-system. Mirrors GHL's Estimates feature (not their Invoices or Documents-with-e-signature; those are scoped for v2/v3).

### Data model

Quotes live in a flat top-level collection `quotes/{id}` rather than under a contact subcollection — the operator's standalone /quotes list page is the primary access path, and Firestore queries against subcollections-of-subcollections get awkward. Each doc carries the usual tenancy keys (`agencyId / subAccountId / createdByUid`) plus `contactId` for the per-contact subscription.

Money fields: `lineItems[]` (description, quantity, unitPrice — array stored inline because line counts are bounded and Firestore array updates are atomic enough at this scale), `globalDiscount` (`{type: "percent" | "flat", value} | null`), `globalTaxPercent`, `currency` (ISO 4217). Live totals come from [src/lib/quotes/calc.ts](src/lib/quotes/calc.ts)::`computeQuoteTotals()` — a pure function imported by the builder UI (live preview), the public view (recipient render), the email template (subject line), and the auto-deal helper (deal value = total). Single source of truth.

Lifecycle: `draft → sent → viewed → accepted | declined | expired → paid`. `expired` is **derived at read time** (`effectiveQuoteStatus()` returns "expired" when `validUntil < now` regardless of stored status) so we don't need a background sweep to flip it.

Quote numbers: `Q-YYYY-NNNN`, per-sub-account counter that resets each year. Issued atomically by [src/lib/quotes/number.ts](src/lib/quotes/number.ts)::`issueQuoteNumber()` via a Firestore transaction on `subAccounts/{id}/counters/quoteNumbers`. Two operators issuing simultaneously can't collide.

### Public token

The recipient-facing /q/[token] link uses a custom token shape `${quoteId}.${nonce}.${HMAC-SHA256}` (not the pure `id.HMAC` pattern unsubscribe links use). The 16-byte random nonce is the rotation primitive: every send (or re-send) mints a fresh token, and only the **SHA-256 hash** of the active token is persisted on the quote doc (`publicTokenHash`). Re-sending invalidates the previous link without needing to store a token blacklist. A Firestore admin dump can't be used to forge accept-requests — only the hash leaks, not the raw token.

Verification path: [src/lib/quotes/token.ts](src/lib/quotes/token.ts)::`verifyQuoteToken()` checks HMAC, then [src/app/q/[token]/page.tsx](src/app/q/[token]/page.tsx) and [src/app/api/quotes/[token]/respond/route.ts](src/app/api/quotes/[token]/respond/route.ts) each re-hash the presented token and compare against `quote.publicTokenHash`. Mismatch → 404 (don't reveal the quote exists). Uses `AUTOMATIONS_TOKEN_SECRET` — same env var as unsubscribe links; rotating it invalidates every outstanding quote link in addition to every unsubscribe link.

### Send flow

[src/app/api/sub-accounts/[id]/quotes/[quoteId]/send/route.ts](src/app/api/sub-accounts/[id]/quotes/[quoteId]/send/route.ts) is the only authenticated entry point that mints a token + sends an email. Sequence: verify sub-account member → load quote + contact + sub-account → check Resend is configured (`emailIsConfigured()`; 503 if not) → issue fresh token → render email via [src/lib/quotes/email.ts](src/lib/quotes/email.ts)::`renderQuoteEmail()` → `sendEmail()` with `Reply-To = caller.email` → write `{status: "sent", sentAt, viewedAt: null, publicTokenHash, updatedAt}` → fire lifecycle side-effects (activity row + automation trigger).

Email sender uses the deployment-wide `EMAIL_FROM` (per v1 locked spec — no per-sub-account custom sender yet). The body opens with `${businessName} has prepared a quote for your review.` so the recipient knows who sent it even with the shared sender address.

### Respond flow

[src/app/api/quotes/[token]/respond/route.ts](src/app/api/quotes/[token]/respond/route.ts) is the recipient-facing endpoint — no auth, token IS the credential. Sequence: verify token → parse `{action: "accept" | "decline", reason?, note?}` → Firestore transaction (re-read quote inside, verify hash + status + expiry, flip status + stamp the relevant timestamp). Transaction guard prevents two concurrent accepts from producing inconsistent state if the recipient triple-clicks on a slow connection.

After the transaction commits, [src/lib/quotes/lifecycle.ts](src/lib/quotes/lifecycle.ts) helpers fire side-effects: activity timeline row + automation trigger + (on accept, if `autoCreateDealOnAccept`) a new Deal at the "Won" pipeline stage with the quote total as value. All helpers swallow errors internally — a stale activity write can't 500 the recipient's accept click.

### Decline reason picker

Borrowed UX from GHL's Documents/Estimates flow: predefined reasons (`"Too expensive"`, `"Not the right fit"`, `"Bad timing"`, `"Going with a competitor"`, `"Other"`) + optional free-text note. `"Other"` requires a note. The reason + note land in `quote.declineReason` + `quote.declineNote` and surface in the operator's detail-page lifecycle timeline.

### Lifecycle side-effects

[src/lib/quotes/lifecycle.ts](src/lib/quotes/lifecycle.ts) owns three helpers wired into every state-changing route:
- `recordQuoteActivity(quote, event, opts?)` — writes a row to `contacts/{contactId}/activities` with type `quote_sent / viewed / accepted / declined / marked_paid`. Renders content using `computeQuoteTotals()` so the timeline reads "Quote Q-2026-0001 (USD $4,200.00) accepted by recipient." Visualised in [src/components/contacts/activity-timeline.tsx](src/components/contacts/activity-timeline.tsx) with brand-consistent icons (`FileSignature`, `Eye`, `CheckCircle2`, `XCircle`, `DollarSign`).
- `fireQuoteTrigger(quote, trigger)` — dispatches to the existing automations engine via `fireTriggers()`. `AutomationTriggerType` now includes the four quote events. **Caveat:** the only `recipeType` shipped is `instant_response`, which only handles `form_submit` in `computeFirstStepDelay()`. Creating a quote-triggered automation today creates the execution doc but produces no sends until v2 extends the recipe types. Dispatch plumbing is in place; recipe support is the missing piece.
- `autoCreateDealForAcceptedQuote(quote)` — when the operator's per-quote `autoCreateDealOnAccept` checkbox is true (default), creates a Deal at the "Won" stage with the quote total. Stamps the operator's `createdByUid` so the deal appears in the pipeline as if they created it manually. Also writes a `pipeline_moved` activity entry so the timeline reads naturally.

### Operator UX

Two entry points (mirrors Deals + Tasks pattern):
1. **Sidebar → Quotes** → [src/app/(dashboard)/sa/[subAccountId]/quotes/page.tsx](src/app/(dashboard)/sa/[subAccountId]/quotes/page.tsx) — all quotes in the sub-account with filter chips (Draft / Sent / Viewed / Accepted / Declined / Expired / Paid) + status counts + search across quote number + contact name + billed-to-organization.
2. **Contact profile → Quotes section** → [src/components/contacts/contact-quotes.tsx](src/components/contacts/contact-quotes.tsx) renders below the Deals card, listing that contact's quotes with a "+ Quote" shortcut that opens the new-quote page pre-selecting the contact.

The detail page ([src/app/(dashboard)/sa/[subAccountId]/quotes/[id]/page.tsx](src/app/(dashboard)/sa/[subAccountId]/quotes/[id]/page.tsx)) toggles between **view mode** (read-only summary + Send / Mark-paid / Delete / Edit actions) and **edit mode** (mounts the builder for inline updates). Sent quotes are editable per the locked v1 spec — operator can fix typos and re-send without creating a new revision (revision tracking is a v2 add).

### What's intentionally NOT in v1

- **Inline Stripe payment collection** — operator marks paid manually. v2 adds a "Pay now" button on the public page that opens a Stripe Checkout session and auto-flips status on the webhook.
- **E-signature** — accept is one-click. GHL splits this into a separate "Documents & Contracts" product with a legally-binding signature certificate (IP, geo, timestamps per signer); v3 territory if buyers ask for it.
- **Quote templates** (save & reuse) — every quote is built fresh in v1. Easy v2 add — extend the new-quote flow to optionally seed from a saved template.
- **Multiple recipients per quote** — single `contactId`. v2 if it comes up.
- **Per-line tax rates** — single global tax % in v1. Per-line is GHL parity but a much bigger UI lift.
- **PDF email attachment** — email links to the public page; PDF rendered there on demand if needed. v2.
- **SMS-send option** — email-only for v1. The Twilio wrapper exists; v2 just adds a "Send via SMS" alternative.
- **Quote-triggered automations actually firing sends** — see the `fireQuoteTrigger` caveat above. Type plumbing is in place; recipe support is the v2 piece.

### Setup contract

No new env vars. Reuses `RESEND_API_KEY` + `EMAIL_FROM` (email send), `AUTOMATIONS_TOKEN_SECRET` (HMAC token signing), Firebase (storage), `NEXT_PUBLIC_APP_URL` (public URL construction). The buyer who clones LeadStack and follows the existing Phase 3 onboarding gets Quotes working out of the box — fits inside the existing Resend setup step. Graceful degradation: if Resend isn't configured, the builder still works locally (create / edit / save drafts), the Send button just returns 503 with a friendly "Configure Resend to send quotes" message.

## Products + Invoices (v1, extends Quotes)

A reusable product catalog plus an Invoice document type that shares the Quotes collection. Built on top of v1 Quotes; same Firestore doc family, same builder, same public view — extended in three ways:

1. **`kind: "quote" | "invoice"` on the quotes doc.** A document starts life as either, or an accepted quote is converted to an invoice in place via `POST /api/sub-accounts/[id]/quotes/[quoteId]/convert-to-invoice` (kind flips, `INV-YYYY-NNNN` number issued, public token rotated). State machines diverge: quotes go `draft → sent → viewed → accepted → paid`; invoices go `draft → sent → viewed → paid` (no accepted step — operator confirms payment landed in Stripe and clicks Mark as paid).

2. **`products/{id}` collection.** Per-sub-account catalog: `name`, `description`, `unitPriceCents`, `currency`, `active`. The builder's "Add from catalog" picker snapshots `{name, description, unitPriceCents}` into the line item — editing/archiving a product later never mutates historical docs (the snapshot is authoritative; `lineItem.productId` is a back-reference). Routes: `GET|POST /api/sub-accounts/[id]/products`, `PATCH|DELETE /api/sub-accounts/[id]/products/[productId]`.

3. **Per-sub-account PayPal.me payment links (v1) / Stripe Connect (v2 roadmap).** Each sub-account pastes a PayPal.me username under `/sa/[id]/dashboard/settings` → **Payments — PayPal**; no API keys, no encryption layer, no platform credentials. On invoice send, `/api/sub-accounts/[id]/quotes/[quoteId]/send` generates `https://paypal.me/{username}/{amount}{currency}` from the invoice total and caches it on the doc as `paymentLinkUrl`. The recipient sees a **Pay** button on the public invoice page that opens the PayPal-hosted page with the amount pre-filled. paypal.me URLs are stateless — every send regenerates the URL (no API call, no "old link" to deactivate). Operator marks invoices paid manually after the payment lands in their PayPal account. Stripe Connect is the planned v2 upgrade (proper OAuth onboarding, webhook-driven auto-mark-paid) — the Settings page already surfaces a greyed-out **Payments — Stripe · Coming soon** card so operators know it's on the roadmap.

### Key files

- Types: [src/types/products.ts](src/types/products.ts), [src/types/quotes.ts](src/types/quotes.ts) (extended), `PayPalConfig` in [src/types/tenancy.ts](src/types/tenancy.ts)
- PayPal helper: [src/lib/paypal/payment-link.ts](src/lib/paypal/payment-link.ts) — `buildPaypalInvoiceUrl({ paypal, invoice })`, pure URL builder, no API call
- Settings UI: [src/components/settings/sub-account-paypal-section.tsx](src/components/settings/sub-account-paypal-section.tsx) (active), [src/components/settings/sub-account-stripe-section.tsx](src/components/settings/sub-account-stripe-section.tsx) (coming-soon placeholder)
- API: [src/app/api/sub-accounts/[id]/paypal-integration/route.ts](src/app/api/sub-accounts/[id]/paypal-integration/route.ts)
- Products UI: [src/app/(dashboard)/sa/[subAccountId]/products/page.tsx](src/app/(dashboard)/sa/[subAccountId]/products/page.tsx)
- Convert route: [src/app/api/sub-accounts/[id]/quotes/[quoteId]/convert-to-invoice/route.ts](src/app/api/sub-accounts/[id]/quotes/[quoteId]/convert-to-invoice/route.ts)

### What's intentionally NOT in v1

- **Stripe Connect.** Roadmap (v2). Will replace the placeholder card with a real "Connect with Stripe" OAuth button. Bigger one-time setup (register as a Stripe Connect platform) but gives card payments + auto-mark-paid via webhooks.
- **Webhook auto-mark-paid.** PayPal.me has no payment-status callback — the operator marks invoices paid manually after the payment lands. Stripe Connect (v2) will fix this.
- **Recurring/subscription products** — one-off only.
- **Partial payments / deposits.** Defer until asked.
- **PDF download in v1?** Already shipped — operator's PDF button on the detail page + recipient's "Download PDF" link on the public invoice view ([src/lib/quotes/pdf-document.tsx](src/lib/quotes/pdf-document.tsx)).
- **PayPal Invoicing API or Partner Referrals.** Full PayPal integration would give webhooks + branded invoices but requires per-sub-account API credentials. paypal.me is enough for MVP.

### Setup contract

**No new env vars.** PayPal.me is a public username, not a secret — no encryption layer, no `SUB_ACCOUNT_KMS_KEY`, no platform credentials. Sub-account owners paste their PayPal.me username under Settings → Payments and they're done. Reuses `RESEND_API_KEY` + `EMAIL_FROM` (invoice email send), `AUTOMATIONS_TOKEN_SECRET` (public-link HMAC), Firebase (storage), `NEXT_PUBLIC_APP_URL` (public URL construction).

## Social Planner v1

Schedule + auto-publish social posts to a sub-account's connected **Facebook Page** and **Instagram Business** account — a built-in, GHL-style "Social Planner". v1 scope is deliberately tight: **Meta-only** (FB + IG), **single pasted image URL** (no upload), **caption + schedule**, with a content calendar. Everything else (LinkedIn/TikTok/GBP, media upload, analytics, approvals, recurring/queues/RSS) is deferred.

### Connection — shared with the inbox (one `metaConfig`, no duplication)

Posting does **not** add a second Meta connection. It rides the **same** `subAccountDoc.metaConfig` the inbox uses (see "Facebook Messenger + Instagram DM inbox"). The single connect/disconnect surface is the **"Facebook & Instagram"** card in Settings; `metaConfig.capabilities = { inbox, publish }` records what the stored token can actually do. The connect flow ([.../meta/connect](src/app/api/sub-accounts/[id]/meta/connect/route.ts)) requests publish scopes (`pages_manage_posts` + `instagram_content_publish`) **only when the Social gate is on**, and the callback stamps `capabilities.publish` from what Meta actually granted. `metaCanPublish(metaConfig)` (in [src/lib/comms/meta-capabilities.ts](src/lib/comms/meta-capabilities.ts)) is the single readiness check used by the composer, the create route, and the publish callback — so a connection made for the inbox only never looks post-ready, and reconnecting can't silently downgrade a posting token.

### Data model

`socialPosts/{id}` (flat top-level, like `quotes`) — see the Firestore Collections table. Caption + optional `imageUrl` + `targets` (`facebook`/`instagram`) + `status` (draft → scheduled → publishing → published/failed) + `scheduledAt`/`publishedAt` + per-target `results[]` + `qstashMessageId`. Rules are read-only for members; all writes go through Admin-SDK routes. Client reads via `subscribeToSocialPosts` ([src/lib/firestore/social-posts.ts](src/lib/firestore/social-posts.ts)) — single-field `subAccountId` query, no composite index needed.

### Scheduling + publish pipeline (mirrors broadcasts/automations)

1. **Create / schedule** — `POST /api/sub-accounts/[id]/social/posts` (admin; gate + `metaCanPublish` + IG-needs-image validation). Drafts just persist; scheduled posts call `publishSocialPost()` ([src/lib/automations/qstash.ts](src/lib/automations/qstash.ts)) to enqueue a QStash callback at `scheduledAt` (dedup id `social_<postId>`) and store the message id. `DELETE …/social/posts/[postId]` removes a post (a still-queued QStash job then no-ops).
2. **Publish callback** — `POST /api/social/publish/step` (public path; Upstash-signature-verified, in `PUBLIC_PATH_PATTERNS`). A Firestore transaction flips `scheduled → publishing` to claim the post (idempotent against QStash retries / a deleted post → 200 no-op), then calls `publishToFacebookPage()` (feed, or `/photos` when an image is set) and/or `publishToInstagram()` (container-create → publish; IG requires a public image URL). Records per-target `results` and sets `published`/`failed`. Always returns 200 (a failed FB/IG call is recorded, not retry-stormed).

### UI

Gated **`/social`** sidebar entry (LOCKED badge when off, like Website). The page ([src/app/(dashboard)/sa/[subAccountId]/social/page.tsx](src/app/(dashboard)/sa/[subAccountId]/social/page.tsx)) has two tabs: **Calendar** (month grid of scheduled/published posts + an all-posts list with status badges, failure reasons, delete) and **Connections** (read-only status of the shared Meta connection + capability + "Manage connection in Settings" deep link). **New post** opens the composer (caption + image URL + FB/IG checkboxes + datetime); it's disabled until `metaCanPublish` is true.

### Gates, scopes, setup contract

Agency gate `socialPlannerEnabledByAgency` (off by default). **No new env vars** — reuses the inbox's `META_APP_ID` / `META_APP_SECRET` (+ `META_WEBHOOK_VERIFY_TOKEN` for the shared webhook), `AUTOMATIONS_TOKEN_SECRET` (OAuth state), `QSTASH_*` (scheduled publish), `NEXT_PUBLIC_APP_URL`. Run `firebase deploy --only firestore:rules` so the `socialPosts` rules deploy. The hard external dependency is **Meta App Review** for `pages_manage_posts` + `instagram_content_publish` (on top of the messaging review) — until approved, only Meta app admins/testers can grant posting.

### Agency-owner setup walkthrough (both inbox + posting)

When a sub-account wants Messenger/IG inbox AND scheduled posting, it's **one connection**:

1. **(One-time, developer)** Meta app configured with `META_APP_ID`/`META_APP_SECRET`; register the OAuth redirect URI (`…/api/sub-accounts/{id}/meta/callback`) and webhook URL (`…/api/webhooks/meta`) shown on the Settings card; submit Meta App Review for the messaging **and** posting permissions; `firebase deploy --only firestore:rules`.
2. **(Agency owner)** `/agency/sub-accounts` → **Manage** the sub-account → tick **both** "Facebook + Instagram inbox" **and** "Social Planner", then Save. Order matters: both gates must be on **before** connecting so the connect requests posting scopes.
3. **(Sub-account admin)** Settings → **Facebook & Instagram** card → **Connect** → approve **all** permissions in the Facebook dialog (declining posting comes back inbox-only) → confirm the Page (first managed Page in v1) which must have a linked **IG Business/Creator** account.
4. **Verify** the card's capability badges show **Inbox enabled** + **Posting enabled**. If posting shows "not granted", click **Reconnect** and approve posting (also the fix if they connected for the inbox before the Social gate was on).
5. **Use:** inbox in Conversations; scheduling in Social Planner → New post.

Disconnect (Settings) removes **both**; that's why the Social Planner Connections tab is read-only and points to Settings.

### What's intentionally NOT in v1

- **Other networks** (LinkedIn, TikTok, GBP, YouTube, Pinterest, Threads) — Meta-only.
- **Media upload** — pasted https image URL only (IG's Content Publishing API is URL-based anyway). Firebase Storage upload is the v2 add.
- **Video / multi-image / Reels / Stories**, **recurring / evergreen queues / RSS / bulk CSV**, **post approval workflow**, **AI caption generation**, **analytics** (engagement/reach), **editing or deleting the live post on-platform** (delete only removes it from the calendar), **multi-Page selection** (first Page only).

## Booking pages v1

Native Calendly-style slot picker per sub-account. The operator configures a Booking Page (durations, working hours, optional price, optional reminder offsets) and shares the public URL `/b/[subAccountId]/[slug]`. A visitor picks a slot, the server transactionally re-verifies availability, reconciles a Contact, mints an Event, and sends an ICS-attached confirmation email. Reschedule + cancel + reminders + payment-expiry are all queued through QStash so they keep firing across Vercel cold starts.

### Data model

- `subAccounts/{id}/bookingPages/{pageId}` — page config (slug, timezone, duration, padding, working hours, required fields, optional `priceCents`, optional `reminderOffsetMinutes[]`, `status: "draft" | "published"`).
- `events/{eventId}` — the existing Calendar events collection picks up two new optional fields: `bookingPageId` (denormalised back-reference) + `bookingMeta` (the recipient-typed payload + ICS uid).
- Token: bookings mint a public `bookingEventToken` HMAC-signed via `AUTOMATIONS_TOKEN_SECRET`, used in confirmation-email links so the recipient can reschedule or cancel without a login. The raw token never persists — only the SHA-256 hash on the event doc.

### Send flow

1. **Public page** (`/b/[subAccountId]/[slug]`) — server-renders the page config + the next ~14 days of available slots from `lib/booking/availability.ts::resolveAvailability()`.
2. **POST `/api/booking/[saId]/[slug]/availability`** — recipient-facing availability re-check (per-IP rate-limited). Used by the date picker when the visitor lands.
3. **POST `/api/booking/[saId]/[slug]/book`** — the actual booking transaction. Validates the inbound payload, re-verifies the slot is still free, reconciles a Contact via `lib/booking/contact-reconcile.ts` (email-first match, falls back to phone, otherwise creates a `source: "booking"` Contact), mints the Event, and triggers the lifecycle pipeline.
4. **Confirmation email** (`lib/booking/email.ts` + `lib/booking/ics.ts`) — sends through the sub-account's verified sending domain via `tenantFrom(sub)`. The ICS attachment uses an opaque uid per event so calendar updates (`METHOD:REQUEST` on book, `METHOD:CANCEL` on cancel) chain correctly in Gmail/Outlook.

### Reschedule + cancel

- `/api/events/[token]/reschedule` and `/api/events/[token]/cancel` — anonymous endpoints, token IS the credential. Each transactionally moves or kills the event, re-mints the ICS uid, and fires the matching lifecycle email + activity entry.
- `/api/events/reminder/step` — QStash callback for each configured reminder offset. Pulls the live event (so a reschedule cancels stale reminders), checks the booking page's `reminderOffsetMinutes[]`, and sends if still valid.

### Paid-booking flow

Pages with `priceCents > 0` mint a `holdUntil` window on the event at book time. The recipient sees a "Pay to confirm" CTA → PayPal.me link (reuses Products + Invoices' `lib/paypal/payment-link.ts`). An operator clicks **Mark paid** in the dashboard to flip the event to confirmed. `/api/events/payment/expire-step` is a QStash callback that auto-cancels the hold when `holdUntil` lapses without payment — same lifecycle email path as a manual cancel, just with a `paymentExpired` reason.

### Lifecycle side-effects

[src/lib/booking/lifecycle.ts](src/lib/booking/lifecycle.ts) is the single helper that every state-changing booking route calls. It:
1. Writes a typed activity row to `contacts/{contactId}/activities` (`event_booked`, `event_rescheduled`, `event_cancelled`, `event_paid`, `event_payment_expired`).
2. Dispatches into `fireTriggers()` with the matching `AutomationTriggerType` — so the booking events appear alongside form-submit, quote-accept, etc. in the automation engine. (Same caveat as Quotes: the v1 `instant_response` recipe doesn't handle these triggers yet; the dispatch plumbing is in place, recipe support is the missing piece.)
3. Returns the lifecycle outcome so the calling route can include it in the response body.

### Setup contract

**No new env vars.** Reuses `RESEND_API_KEY` + `EMAIL_FROM` (confirmations), `AUTOMATIONS_TOKEN_SECRET` (HMAC for the public reschedule/cancel tokens), `QSTASH_*` (reminder + payment-expiry schedules), `NEXT_PUBLIC_APP_URL` (public URL construction). Booking pages are public so `/b` + `/api/booking` are in middleware's `PUBLIC_PATHS`. Reuses the per-sub-account dedicated sending domain when configured — confirmation emails go out from the tenant brand.

## Public API v1

A versioned REST surface under `/api/v1/*` for the sub-account-scoped resources (contacts, deals, tasks, events, form submissions) plus signed outbound webhooks. Built so an agency's clients can plug LeadStack into Zapier, Make, n8n, or custom integrations without operator hand-holding.

### Authentication + keys

- Sub-account admin mints keys from the dashboard's **API Keys** section. Keys are scoped to one sub-account and one mode (`live` or `test`). Format: `lsk_{mode}_{prefix}_{secret}`. Only the SHA-256 hash of the secret is persisted (`subAccounts/{id}/apiKeys/{keyId}.secretHash`); the raw secret is shown ONCE at creation time and never again.
- Every `/api/v1/*` request includes `Authorization: Bearer lsk_…`. The auth helper `lib/api/auth.ts::requireApiKey()`:
  1. Parses the bearer header, looks up the key by prefix + verifies the SHA-256 hash matches the stored hash.
  2. Loads the sub-account doc, checks `apiAccessEnabledByAgency === true` (returns 403 `api_access_disabled` otherwise — see Agency feature gates).
  3. Returns a `{ subAccountId, agencyId, keyId, mode }` context. Every downstream Firestore query filters by `subAccountId` so a leaked key only ever sees its own sub-account.
- **Test mode** (`lsk_test_*`) lets the buyer's clients exercise the API without firing real automations / SMS / emails — the form-submission route, for example, gates `fireTriggers()` on `ctx.mode === "live"`.

### Infrastructure modules

All under `src/lib/api/`:
- `auth.ts` — `requireApiKey()` + key hashing.
- `keys.ts` — mint / list / revoke helpers.
- `responses.ts` — uniform `{ data, error }` envelope + pagination cursors.
- `versions.ts` — version-pinning header (`x-api-version`) so future v2 doesn't break v1 callers.
- `idempotency.ts` — replay protection. POSTs accept `Idempotency-Key`; the helper stores `(key, requestHash, responseSnapshot)` on `idempotency/{subAccountId}/{key}` for 24h and replays the saved response on duplicate keys.
- `rate-limit.ts` — per-key token bucket (in-memory LRU, defaults to 60 req/min). Returns `429` with `Retry-After`.
- `redact.ts` — installs a console wrapper that masks `lsk_*` secrets in logs so a stray `console.log(req.headers)` doesn't leak a tenant key.
- `logs.ts` — append-only request log per key for debug visibility in the dashboard.
- `serializers/{contacts, deals, tasks, events}.ts` — strict wire-format mappers so internal field renames don't accidentally break API consumers.

### Webhooks

Outbound webhooks let the sub-account react to platform events (contact created, deal moved, event booked, …) without polling.

- Sub-account admin creates a subscription from the dashboard's **Webhooks** section: target URL + event-type allowlist + signing secret (auto-generated).
- `lib/api/webhooks/dispatch.ts::emitWebhookEvent({subAccountId, type, payload})` is the fan-out helper called from every state-changing route (contact.created, form.submission.created, event.booked, etc.). It looks up matching subscriptions for the sub-account, signs each payload (`lib/api/webhooks/signing.ts` — HMAC-SHA256 with the subscription secret), and POSTs in the background with retries on 5xx.
- Receivers verify by recomputing HMAC over the raw body using the secret they were shown at creation. Standard `Webhook-Signature` + `Webhook-Timestamp` headers; reject requests older than 5 minutes to defeat replays.

### Operator surfaces

Three sub-account settings sections:
- **API Keys** ([components/settings/sub-account-api-keys-section.tsx](src/components/settings/sub-account-api-keys-section.tsx)) — mint, label, revoke; one-time secret reveal modal on create.
- **API Recipes** ([components/settings/sub-account-api-recipes-section.tsx](src/components/settings/sub-account-api-recipes-section.tsx)) — curated recipe library (Zapier, Make, n8n, plain cURL) wired to the live API base URL + per-key auth header so the buyer's client can copy-paste.
- **Webhooks** ([components/settings/sub-account-webhooks-section.tsx](src/components/settings/sub-account-webhooks-section.tsx)) — subscription CRUD + delivery log viewer (last 50 attempts, with status code + retry count).

All three render a "locked by your agency" state when `apiAccessEnabledByAgency !== true`, mirroring the email-domain section's pattern.

### Setup contract

**No new env vars.** Reuses `NEXT_PUBLIC_APP_URL` (for the docs base URL displayed in API Recipes), Firebase (key/subscription storage). The API key hash uses the same SHA-256 utility the rest of the codebase uses — no separate signing secret needed.

## Website builder (gitpage.site v1)

Each sub-account can hold **up to `MAX_WEBSITES_PER_SUBACCOUNT` (5)** website docs at `subAccounts/{id}/website/{siteId}` (see [src/lib/website/limits.ts](src/lib/website/limits.ts)). The legacy singleton at `.../website/main` remains valid as one of the slots — no migration. The page at [my-ghl-app/src/app/(dashboard)/sa/[subAccountId]/website/page.tsx](src/app/(dashboard)/sa/[subAccountId]/website/page.tsx) owns the collection `onSnapshot` + the "Add website" affordance + the account-wide activation gate, and renders one card per site via [src/components/website/website-builder.tsx](src/components/website/website-builder.tsx). Each `<WebsiteBuilder/>` holds its own form (a long sectioned form mirroring gitpage's typeform inputs — Basics / Pages / Services / Business / Design / FAQ), collapse state, and build/status logic; the parent passes the live doc down (one listener, not one per card). Cap is enforced server-side in `POST /api/sub-accounts/[id]/website` (the create-site route, returns 409 on the 6th). Site cards expose a **Remove** (trash) action that deletes the doc to free a slot — distinct from **Rebuild** (reset to draft).

- **Submit**: [src/lib/gitpage/client.ts](src/lib/gitpage/client.ts) `submitBuild()` POSTs to `https://www.gitpage.site/api/v1/generate-site` with `buildType: "local" | "vsl"` (selected by the user via the **Site type** picker on the page) and the agency's `GITPAGE_API_KEY`. Returns 202 + `formResponseId` (prefixed `build_…`). The build route persists `status: "queued"` and the job id, then schedules the first QStash poll. v1 contract is frozen — additions ship into v1, breaking changes land at `/api/v2/`.
- **Build types**: `local` is the multi-page LocalSite (home + optional services/contact/terms). `vsl` is a single-page Video Sales Letter funnel — hero + embedded video + bullets + one CTA. The VSL form drops the Pages/Services/Business sections and shows a Video section instead; `video_link` (any http(s) embed URL — YouTube/Vimeo/Wistia) is required, and `cta_link` is mandatory because the funnel collapses without a destination after the video. Mode is stored on `WebsiteConfig.build_type`; existing docs without it default to `"local"` on read.
- **Polling**: [src/app/api/sub-accounts/[id]/website/[siteId]/poll/route.ts](src/app/api/sub-accounts/[id]/website/[siteId]/poll/route.ts) is a QStash signature-verified callback that hits gitpage's status endpoint every 20s, mirrors the result into Firestore, and reschedules itself until terminal (Published/failed) or the 15-minute cap. The QStash payload carries `siteId` (verified against the path) so each site polls its own doc; dedup ids are namespaced by `siteId`. The route is in PUBLIC_PATH_PATTERNS in middleware (regex now `…/website/[^/]+/poll`) because security comes from the signature, not the session cookie.
- **Field name mapping**: internal types use snake_case (matches the rest of the codebase); the gitpage client transforms to camelCase + flat `pages` array at submit time.
- **Design fields**: dropdowns with gitpage's curated values (see [src/lib/website/gitpage-values.ts](src/lib/website/gitpage-values.ts)). gitpage silently falls back to defaults on unknown values, which would look broken — dropdowns prevent that.
- **Custom palette** requires a 3-hex triple in `customColors`; conditional input appears when `design_color_palette === "Custom"`.
- **Rebuild vs Remove**: `DELETE /api/sub-accounts/[id]/website/[siteId]?reset=1` resets the doc to `draft` (preserves config, clears jobId/liveUrl/status) — the Rebuild button. `DELETE /api/sub-accounts/[id]/website/[siteId]` (no flag) permanently removes the doc to free a slot — the Remove button. Either way the previously-published GitHub repo stays live until manually deleted on gitpage's side — v1 doesn't tear down.
- **Auth model**: one `GITPAGE_API_KEY` per agency; shared across all sub-accounts. Each build's `subAccountId` is sent so gitpage tags the build record. Filter all reads/writes by sub-account on our side — gitpage scopes by agency, not sub-account.
- **Rate limit**: gitpage caps at 30 builds/hour/agency. v1 doesn't add a client-side cap; gitpage returns 429 with `resetAt` when exceeded.
- **Heartbeat / subscription gate**: [src/lib/gitpage/heartbeat.ts](src/lib/gitpage/heartbeat.ts) `sendHeartbeat()` POSTs anonymous deployment metadata (instanceId from `system/heartbeat`, owner email, version, sub-account count, builds-last-day, platform) to `POST /api/v1/leadstack/heartbeat`. The response includes `gitpageStatus.agency: boolean` which gets cached at `system/gitpageStatus`. The website-builder UI reads that doc via `onSnapshot` and renders an "activate" banner when `agency === false`. Fired once per cold start via [instrumentation.ts](instrumentation.ts) and once daily via QStash → [/api/cron/gitpage-heartbeat](src/app/api/cron/gitpage-heartbeat/route.ts) (signature-verified). Disable with `GITPAGE_TELEMETRY=off`. To set up the daily schedule: in Upstash QStash dashboard create a schedule pointing at `${NEXT_PUBLIC_APP_URL}/api/cron/gitpage-heartbeat` with cron `0 3 * * *`.

## Commands
- `pnpm dev` — dev server (Turbopack)
- `pnpm build` — production build
- `pnpm start` — production server
- `pnpm lint` — ESLint
- `pnpm format` — Prettier
- `firebase deploy --only firestore:rules,firestore:indexes` — redeploy rules after any collection change

## Environment Variables

Every single credential is user-provided. Nothing ships embedded. Store in `.env.local` (local) or Vercel env vars (production). See `.env.example` for the template.

### Required for the app to boot
| Var | Source |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | same |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | same |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | same |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | same |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | same |
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase Console → Project Settings → Service accounts → Generate key (JSON) |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | from service account JSON |
| `FIREBASE_ADMIN_PRIVATE_KEY` | from service account JSON (keep as single-line with `\n` escapes, wrapped in double quotes) |
| `COOKIE_SECRET_CURRENT` | `openssl rand -base64 32` |
| `COOKIE_SECRET_PREVIOUS` | same (different value) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally, your production URL in prod |
| `BOOTSTRAP_ADMIN_EMAIL` | The email that's allowed to claim the workspace admin slot on the first signup. Set this BEFORE deploying. Once an admin exists, the var is ignored. |

### Required for billing
| Var | Source |
|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys (test mode for dev) |
| `STRIPE_SECRET_KEY` | same |
| `STRIPE_WEBHOOK_SECRET` | `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints this |
| `STRIPE_PRO_PRICE_ID` | Stripe Dashboard → Product catalog → create your recurring "Pro" price, copy the `price_...` ID |

### Required for email (disables cleanly if missing)
| Var | Source |
|---|---|
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys |
| `EMAIL_FROM` | A sender on a Resend-verified domain, e.g. `"LeadStack <notifications@yourdomain.com>"` |

Without these two vars, `/api/comms/email/send` returns **503** and the Email button in the contact profile still renders but the send fails cleanly.

### Required for SMS (disables cleanly if missing)
| Var | Source |
|---|---|
| `TWILIO_ACCOUNT_SID` | [console.twilio.com](https://console.twilio.com) dashboard |
| `TWILIO_AUTH_TOKEN` | same |
| `TWILIO_FROM_NUMBER` | A phone number owned by the Twilio account (trial or purchased) |

Without these three, `/api/comms/sms/send` returns 503. SMS opt-out (STOP/START) also requires the inbound webhook URL configured on the Twilio number — see the Onboarding Guide below.

### Required for automations (disables cleanly if missing)
| Var | Source |
|---|---|
| `QSTASH_URL` | [console.upstash.com](https://console.upstash.com) → QStash → Quickstart panel. **Region-specific** — copy the URL shown for your token's region (EU vs US). Wrong region = signature failures. |
| `QSTASH_TOKEN` | same panel |
| `QSTASH_CURRENT_SIGNING_KEY` | same panel — verifies inbound `Upstash-Signature` headers |
| `QSTASH_NEXT_SIGNING_KEY` | same panel — used during key rotation |
| `AUTOMATIONS_TOKEN_SECRET` | `openssl rand -base64 32`. HMAC-signs unsubscribe links so they can't be forged. Rotating this invalidates all outstanding unsubscribe links. |

Without these, `/api/automations/step` and the website-builder poll route return 503. Automation triggers still fire on form submit (the `automation_executions` row gets created) but step 0 never executes — the form submission itself still works.

### Required for website builder (disables cleanly if missing)
| Var | Source |
|---|---|
| `GITPAGE_API_KEY` | gitpage.site dashboard — agency-level key, format `gp_…`. Shared across all sub-accounts in this deployment. |
| `GITPAGE_API_URL` | Optional. Defaults to `https://www.gitpage.site`. Override only when mocking locally. |

Without `GITPAGE_API_KEY`, `/api/sub-accounts/[id]/website/[siteId]/build` returns 503 and the **Build site** button surfaces a friendly error. The rest of the Website page (adding sites, form editing) still loads.

### Required for AI Agents (disables cleanly if missing)
| Var | Source |
|---|---|
| `OPENROUTER_API_KEY` | [openrouter.ai](https://openrouter.ai) → Keys. One agency-level key covers every model (Anthropic, OpenAI, Google, etc). Required to power the bot replies on Web Chat + SMS channels. |
| `AI_REPLIES_DEFAULT_MODEL` | Optional. OpenRouter model id used when no per-channel override is set. Defaults to `anthropic/claude-haiku-4-5` (best cost/quality balance for SMS-length replies). Override per channel to use `anthropic/claude-opus-4-7` for premium tiers (~50x cost). |

Without `OPENROUTER_API_KEY`, the AI Agents settings UI still renders but every channel stays silent: the SMS inbound webhook short-circuits past `maybeRespondWithAi`, the Web Chat `/api/web-chat/message` endpoint returns the fallback "I had trouble reaching the server" reply, and the `/api/sub-accounts/[id]/ai-agent/test` endpoint returns 503.

### Optional — Firecrawl (powers the website KB on the AI Agent profile)
| Var | Source |
|---|---|
| `FIRECRAWL_API_KEY` | [firecrawl.dev](https://firecrawl.dev) → Dashboard → API Keys, format `fc_…`. One agency-level key shared across all sub-accounts. |

Without this, the AI Agents → Overview page still renders and the agent still works — but the "Refresh KB" button under the website URL field returns 503 with a friendly message. Without a KB the bot can't answer factual questions about the client's services/pricing/etc; it falls back to "let me check with the team and get back to you" for anything outside the persona prompt.

Single-page scrape only (`/v1/scrape` endpoint). The bot's stored snapshot is capped at 6000 chars (~1500 tokens) so it doesn't bloat the prompt on every reply. Re-crawl on demand; stale KB is cleared automatically whenever the operator changes the website URL.

### Optional — Vapi (powers the AI Voice Agent channel — inbound + Outbound Voice)
| Var | Source |
|---|---|
| `VAPI_API_KEY` | [vapi.ai](https://vapi.ai) → Dashboard → API Keys. Private agency-level key. |
| `VAPI_WEBHOOK_SECRET` | `openssl rand -base64 32`. We send it to Vapi on each assistant create/update so Vapi attaches it as `Authorization: Bearer <secret>` on every callback to us. Rotating it requires re-saving every voice channel so the new value pushes to Vapi. |

Without these, the AI Agents → Voice settings page still renders but the Enable toggle returns 503 with a friendly "Vapi isn't configured on this deployment" error. The shared persona/KB on the Overview, SMS, and Web Chat channels are unaffected.

Voice attaches to the sub-account's **existing dedicated Twilio number** via Vapi BYOC (bring-your-own-carrier) — one number serves SMS + Voice with one bill. Configure Twilio under Settings → SMS first; the Voice settings page surfaces an amber banner until that's done. `NEXT_PUBLIC_APP_URL` must be set and publicly reachable (Vapi POSTs the LLM webhook on every voice turn) — locally that means cloudflared/ngrok per the Phase 3.5 tunnel guide.

Cost footprint: Vapi bills per-minute (model + STT + TTS bundled, roughly 7-15¢/min at Haiku + ElevenLabs); OpenRouter bills per-token on top via our existing `OPENROUTER_API_KEY`. Each turn token cost is logged into the channel's `totalTokensUsed` counter the same way SMS/Web Chat tracks usage.

### Optional — Meta (Facebook/Instagram inbox + Social Planner)
One Meta app powers BOTH the FB Messenger / IG DM inbox AND the Social Planner (they share one connection). All optional — leave unset and both features stay off.

| Var | Source |
|---|---|
| `META_APP_ID` | [developers.facebook.com](https://developers.facebook.com) → your app → Settings → Basic. |
| `META_APP_SECRET` | Same page. Keep secret. |
| `META_WEBHOOK_VERIFY_TOKEN` | Any string you choose; enter the same value in the Meta app's Webhooks config. Needed for inbound inbox messages (not for posting). |

**Gray-out behavior:** when `META_APP_ID` + `META_APP_SECRET` are absent, `metaAppConfigured()` is false, so the **"Facebook + Instagram inbox"** and **"Social Planner"** toggles in the agency Manage dialog are **disabled/grayed out** (with a "set META_APP_ID / META_APP_SECRET" hint), and the feature-gates PATCH route refuses to enable either gate (400). The client reads this via `GET /api/agency/deployment-config` (returns `{ metaConfigured }` — non-sensitive booleans only). An already-enabled gate can still be turned OFF so a legacy state isn't trapped. Derives from the two secrets — there is no separate `NEXT_PUBLIC` flag to keep in sync.

Beyond the env vars, posting also requires **Meta App Review** for `pages_manage_posts` + `instagram_content_publish` (on top of the messaging review). Until approved, only Meta app admins/testers can connect. See "Social Planner v1" + the Meta inbox section.

### Required for leads map (disables cleanly if missing)
| Var | Source |
|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | [account.mapbox.com](https://account.mapbox.com) → Tokens → Create. Free tier covers 50k map loads/month; default public scopes are fine. Public token (starts with `pk.`). |

Without this, the dashboard **Leads map** card renders a "Mapbox not configured" message instead of the map. Form submissions still capture location data (it's stored on the contact regardless) — the data just isn't visualized until you add the token.

Location capture happens server-side in `/api/forms/[id]/submit`: ipapi.co (free tier, 1k/day, no key) gives city + lat/lng; phone country-code parsing (via `libphonenumber-js`) is the fallback for country-level pins. Both fail soft — contacts always save, location fields are just nullable. CSV-imported and manually-created contacts have null location and won't pin on the map (no backfill in v1).

### Required for marketing tracking (all optional, all build-time inlined)
| Var | Source |
|---|---|
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Events Manager → Data Sources → your Pixel. Numeric ID. When set, the Pixel loads on every page (including hosted forms) and hosted-form submissions auto-fire a `Lead` event client-side. Leave blank to skip. |
| `NEXT_PUBLIC_GTM_ID` | Google Tag Manager → Container ID, format `GTM-XXXXXXX`. When set, GTM loads site-wide (script in body + `<noscript>` iframe). Use this as the escape hatch for any tag Pixel doesn't cover — LinkedIn Insight, TikTok Pixel, Hotjar, custom server-side gtag. |

UTM/fbclid/gclid/referrer/landing-page are captured automatically on every public form submission regardless of whether the Pixel is configured — they're stored on `contact.attribution` for downstream use (Conversions API in Sprint B, campaign reporting later). The hosted form is at `/f/[id]`; the agency only needs to encode UTMs in the iframe `src` if embedding via iframe.

### Required for live chat / support (optional)
| Var | Source |
|---|---|
| `NEXT_PUBLIC_CRISP_WEBSITE_ID` | [app.crisp.chat](https://app.crisp.chat) → Settings → Website Settings → Setup Instructions → Website ID (UUID). |

Without this, the Crisp widget doesn't load and every "chat with us" button (pricing checkout-error fallback, privacy-policy contact line) silently no-ops. There's no `mailto:` fallback by design — this codebase doesn't assume you've got a monitored inbox set up at the support email. Either configure Crisp (free tier is fine), pick a different chat widget (Intercom, Tawk.to — swap the script in [src/app/layout.tsx](src/app/layout.tsx)), or replace the `openCrispChat()` calls in [src/lib/crisp.ts](src/lib/crisp.ts) with a route that points at your real support channel (email, contact form, etc).

### Optional — Post-payment GitHub auto-invite

Powers the **"Get instant repo access"** button on `/thank-you`. When a buyer enters their GitHub username, the server calls the GitHub API to add them to a team in your org — exactly the same path operators use today for manual additions, just automated. Without these vars set, `/api/github/invite` returns a friendly error and buyers fall back to the manual chat path.

| Var | Source |
|---|---|
| `GITHUB_TOKEN` | [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) → Generate new token (fine-grained). Resource owner: the **org**. Organization permissions: **Members: Read and write**. Repository access can be "All" or specific — team writes don't need repo perms. |
| `GITHUB_INVITE_ORG` | The org slug, e.g. `Claude-Code-Pro-Camp`. |
| `GITHUB_INVITE_TEAM` | The team slug buyers should be added to, e.g. `leadstack-agency-members`. |

**Security model** worth understanding before you deploy this:
- `/thank-you` is a public route with no auth. `session_id` alone is in the URL bar / referrer / browser history — could leak.
- The defence: `/api/checkout/founders/route.ts` generates a 256-bit `claimToken` at session-create time, stamps it into both `session.metadata.claimToken` and the `success_url` as `&t=...`.
- The Stripe webhook hashes the token (SHA-256) and stores **only the hash** on `purchases/{sessionId}.claimTokenHash`. The raw token never touches the database.
- `/api/github/invite` re-hashes the buyer's submitted token and constant-time-compares to the stored hash. Mismatch → 403.
- 3-attempt lock per session on top of the token gate, plus a transient 5-attempts-per-10-min rate limit.
- Race-condition safe: if the buyer clicks before the webhook lands, the endpoint returns 425 and the dialog auto-retries.

If the org has SAML/SSO enforced, you'll need to authorise the fine-grained PAT for SSO after generating it (org settings → Personal access tokens → Active tokens → Authorize). Without that, GitHub returns 403 even with correct permissions.

---

## Onboarding Guide (for Claude Code)

When the buyer asks you to help them set up this project, or if they seem new and haven't run the app yet, follow the procedure below. This is designed for buyers who may have never used a terminal before — they purchased LeadStack and just need it running. Start at **Phase 0** if they don't yet have their own copy of the repo open; otherwise begin at Phase 1.

### Phase 0: Make sure they're in their OWN repo (not the template)

The buyer is meant to work in a **private repository they generated from the LeadStack template** (`Claude-Code-Pro-Camp/leadstack-agency`), owned by their own GitHub account — NOT a direct clone of the template itself. This keeps their `origin` pointed at their account so their changes never flow back to the shared template, and matches the one-time-license model (their copy is standalone, no upstream link).

- **Invoked from an empty folder?** (The buyer pasted the "Set me up from the LeadStack template" bootstrap prompt from SETUP.md Phase 1.) Do this first:
  1. Ensure `git` + the GitHub CLI (`gh`) are installed; install whatever's missing (`winget install Git.Git GitHub.cli` on Windows, `brew install git gh` on Mac). Remind them to reopen the terminal so PATH updates.
  2. `gh auth login` — they complete the browser device-code step.
  3. `gh repo create <their-username>/my-crm --template Claude-Code-Pro-Camp/leadstack-agency --private --clone` — generates their own private copy and clones it. (`--template`, never a fork.)
  4. Open the new folder, then continue with Phase 1.
- **Project already open?** Confirm it's their copy, not the template: run `git remote -v` and check `origin` is `github.com/<their-username>/…`, NOT `Claude-Code-Pro-Camp/leadstack-agency`. If it points at the template, they cloned the wrong thing — have them generate their own repo (steps above) and reopen it before configuring anything.

**Support channel:** the only support path is the **Crisp chat bubble** on the buyer's purchase / thank-you page — there is no support email. If they're blocked on repo access (e.g. no GitHub invite yet), point them to the chat bubble.

### Phase 1: Check Prerequisites

Run these checks automatically and report what's installed vs missing:

1. `git --version` — need 2.30+
2. `node --version` — need 20+ (LTS; Node 18 is end-of-life)
3. `pnpm --version` — install with `npm install -g pnpm` if missing
4. `firebase --version` — install with `npm install -g firebase-tools` if missing
5. `stripe --version` — optional, install with `winget install Stripe.StripeCLI` (Windows) or `brew install stripe/stripe-cli/stripe` (Mac) for local webhook testing
6. `cloudflared --version` (or `ngrok --version`) — optional, only needed to test automations + the website builder locally. Install one of:
   - **Cloudflare Tunnel**: `winget install --id Cloudflare.cloudflared` (Windows) or `brew install cloudflared` (Mac)
   - **ngrok**: `winget install Ngrok.Ngrok` (Windows) or `brew install ngrok/ngrok/ngrok` (Mac)
   - Pick one — see Phase 3.5 for trade-offs. Skip entirely if the user only wants the core CRM.

After installing anything new, remind the user to close and reopen the terminal so PATH updates.

### Phase 2: Install Dependencies

1. Run `pnpm install` from the project root
2. Verify `node_modules` was created

### Phase 2.5: Brand the landing page

The landing page at `/` is a white-label CRM template. Before going further, edit [src/config/landing.ts](src/config/landing.ts) and fill in `CUSTOM_BRAND`:

1. Ask the buyer:
   - Business name (used in navbar, hero, footer, page title — everywhere)
   - One-line tagline (used in hero subtitle + meta description)
   - Short description (~140 chars; goes under the hero headline)
   - Support email (used on CTA + FAQ + footer)
   - Primary domain (used in footer, og:url; no `https://`, no trailing slash)
   - Pricing tiers (Starter / Pro / Scale) — name, monthly + annual prices, blurb, feature bullets, CTA label, which one is highlighted

2. Write those into `CUSTOM_BRAND` in `src/config/landing.ts`.

3. Tell the buyer they can re-edit this file anytime — every section reads from `CUSTOM_BRAND` at build time.

If the buyer doesn't want to brand it yet, leave the placeholders in — the page still renders cleanly so they can verify the app boots — but call this out as a TODO before Vercel deploy.

### Phase 3: Configure Environment

1. If `.env.local` does not exist, copy `.env.example` to `.env.local`.
2. Generate cookie secrets automatically and write them to `.env.local`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Run twice — paste results into `COOKIE_SECRET_CURRENT` and `COOKIE_SECRET_PREVIOUS`.
3. Set `NEXT_PUBLIC_APP_URL=http://localhost:3000`.

Then walk through each external service. For each, explain what the user does in the browser and what values to paste back. Write values directly into `.env.local` as they're supplied.

#### Firebase Client SDK
Tell the user:
> Go to https://console.firebase.google.com and create a project (or reuse one).
> Then Project Settings → Your apps → click the web icon (`</>`) and register a web app.
> You'll see a `firebaseConfig` object. Paste the whole object here and I'll extract the values.

When they paste, write into `.env.local`:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Then remind them to:
> Enable **Authentication → Sign-in method → Email/Password**.
> Create a **Firestore Database → Start in production mode** (our rules restrict access — test mode isn't needed).

#### Firebase Admin SDK
> Firebase Console → Project Settings → Service accounts → **Generate new private key**. Open the JSON file it downloads and paste the contents here.

Extract and write:
- `FIREBASE_ADMIN_PROJECT_ID` ← from `project_id`
- `FIREBASE_ADMIN_CLIENT_EMAIL` ← from `client_email`
- `FIREBASE_ADMIN_PRIVATE_KEY` ← from `private_key`, wrapped in double quotes in the env file (keep `\n` escapes literal — Node's `replace(/\\n/g, '\n')` unwraps them at runtime).

**Treat the JSON as a secret.** Don't save it in the repo, don't paste it in chat logs that are shared. After you've extracted the three fields, delete the downloaded JSON.

#### Deploy Firestore rules + indexes
`.firebaserc` is gitignored (per-developer project alias). On a fresh clone, point the Firebase CLI at the user's project once:
```bash
firebase login                     # only on first setup
firebase use <their-project-id>    # writes .firebaserc locally; do this once per clone
firebase deploy --only firestore:rules,firestore:indexes
```

Always deploy **both** in the same command. Rules and indexes live in separate files (`firestore.rules` and `firestore.indexes.json`) and are deployed separately by default — running `--only firestore:rules` alone silently skips indexes, and any feature that needs a compound query (`where X == ... where Y >= ...`) fails with `FAILED_PRECONDITION: The query requires an index` at runtime. The booking-availability endpoint is the most common trap; quotes + broadcasts can hit it too. Indexes take a few minutes to BUILD after deploy — visible at https://console.firebase.google.com/project/&lt;your-project&gt;/firestore/databases/-default-/indexes.

Re-run whenever you add a new collection, edit `firestore.rules`, or add an entry to `firestore.indexes.json`. `firebase.json` is committed and shared.

#### Stripe
> Go to https://dashboard.stripe.com — make sure **Test mode** is ON (toggle top-right).
> Developers → API keys. Paste the publishable + secret keys here.

Write:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`

> Now create your product in Stripe. The shipped checkout helper references one price ID:
> - **Pro Plan** — a recurring price (any amount + interval that matches what the landing's Pro tier advertises). Used by the standard subscription checkout.
> Create whatever product + price matches the buyer's pricing model. Copy the Price ID (starts with `price_`) and paste here.

Write:
- `STRIPE_PRO_PRICE_ID`

The checkout helpers at `src/lib/stripe/checkout.ts` are easy to rewire once the buyer's pricing model is finalized (e.g. adding annual prices, multiple tiers, one-time fees).

Webhook secret (separate terminal):
```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
Copy the `whsec_...` that prints on start. Write to:
- `STRIPE_WEBHOOK_SECRET`

#### Resend (email)
> Go to https://resend.com, sign up, then **Domains → Add Domain**. Add DNS records to your domain's DNS provider, wait for verification (minutes to hours).
> Then **API Keys → Create API Key → Full access**. Paste the key here.

Write:
- `RESEND_API_KEY`
- `EMAIL_FROM` — must be on a verified domain. Example: `"LeadStack <notifications@yourdomain.com>"`.

If the user doesn't own a domain yet, they can still test with Resend's sandbox domain — `EMAIL_FROM="onboarding@resend.dev"` works for test sends but will be flagged as untrusted in production.

#### Twilio (SMS)
> Go to https://console.twilio.com, sign up (free trial gives a phone number + credits).
> From the dashboard, copy **Account SID** and **Auth Token**.
> Under **Phone Numbers → Manage → Active Numbers**, copy your trial or purchased number in E.164 format (`+15551234567`).

Write:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

**Trial-account caveats:** Twilio trial accounts can only send to verified phone numbers and prepend a "Sent from a Twilio trial account" banner. For real usage, upgrade the account and (in the US) register A2P 10DLC.

**Inbound webhook URL (required for STOP/START opt-out):**
Twilio needs to know where to POST when someone replies STOP. After Phase 3.5 (you'll have a public tunnel URL) or Phase 5 (you'll have a Vercel URL), come back here:
> Twilio Console → Phone Numbers → Manage → Active Numbers → click your number.
> Scroll to **Messaging Configuration** → **A MESSAGE COMES IN** → set the URL to `https://your-domain/api/webhooks/twilio/inbound` (HTTP POST). Save.

Without this, your code can still send SMS, but inbound STOP messages never reach the app and `contact.smsOptedOut` won't flip — meaning automations will keep texting people who opted out. Skip if you're not setting up automations.

#### Upstash QStash (Automations + Website polling)
QStash is a managed message queue — it's how scheduled automation steps and website build polling survive Vercel cold starts. Without it, automations can't send delayed steps and website builds sit at "queued" forever.

> Go to https://console.upstash.com, sign up, then **QStash** → the **Quickstart** panel.

**Important — region matters.** The token is bound to a region (EU or US). The dashboard shows the matching URL endpoint above the token. Copy them together:

Write to `.env.local`:
- `QSTASH_URL` — the URL shown next to your token (e.g. `https://qstash.upstash.io` or the EU equivalent). The SDK doesn't auto-resolve this — wrong region = signature verification fails.
- `QSTASH_TOKEN` — from the same panel
- `QSTASH_CURRENT_SIGNING_KEY` — verifies inbound callbacks
- `QSTASH_NEXT_SIGNING_KEY` — for key rotation; needed even if not actively rotating

**Daily schedules are auto-registered on cold start** — no dashboard click needed. [instrumentation.ts](instrumentation.ts) calls `ensureSchedulesRegistered()` which uses the QStash SDK's `schedules.create()` with stable `scheduleId`s, idempotent on every cold start. A 24-hour marker at `system/scheduleRegistration` skips the round-trip on hot starts so cold-start latency stays under 50ms.

Schedules registered automatically (declared in [src/lib/qstash/register-schedules.ts](src/lib/qstash/register-schedules.ts)):

| scheduleId | Cron | Purpose |
|---|---|---|
| `leadstack-gitpage-heartbeat` | `0 3 * * *` | Daily telemetry ping + gitpage subscription status cache. |
| `leadstack-api-cleanup` | `0 4 * * *` | Daily sweep of expired public-API logs, idempotency cache, and webhook event archive. Replaces Firestore native TTL so no console click needed. |

Auto-registration only fires when `NODE_ENV === "production"` AND `QSTASH_TOKEN` AND `NEXT_PUBLIC_APP_URL` are set. Local dev does nothing. If `NEXT_PUBLIC_APP_URL` changes (e.g. moving from a tunnel to Vercel), the marker is invalidated and the next cold start re-registers against the new URL. You can verify schedules landed by visiting the **Schedules** tab in the Upstash QStash dashboard after your first production deploy.

#### Automations token secret
Used to HMAC-sign unsubscribe links so a malicious actor can't forge one and unsubscribe arbitrary contacts. Generate locally:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Write to `.env.local`:
- `AUTOMATIONS_TOKEN_SECRET` — paste the output

If you ever rotate this, every existing unsubscribe link in inboxes becomes invalid — by design. Old recipients clicking will see a 404.

#### gitpage.site (Website builder)
Each sub-account can publish a marketing site via gitpage.site. One agency-level API key powers all sub-accounts.

> Request your agency API key from gitpage.site (format `gp_<long hex>`).

Write to `.env.local`:
- `GITPAGE_API_KEY` — paste the key
- `GITPAGE_API_URL` — leave unset; the client defaults to `https://www.gitpage.site`. Override only if you're mocking the API locally.

gitpage rate-limits at **30 builds per hour per agency** (shared across all sub-accounts). The build route surfaces 429s as a friendly error to the operator.

#### OpenRouter (AI Agents)
LeadStack uses OpenRouter as the LLM gateway — one key reaches every model (Claude, GPT, Gemini, etc.). Skip this entire section if the buyer doesn't plan to use the AI Agents feature; the rest of the CRM works without it.

> Go to [openrouter.ai](https://openrouter.ai), sign up, deposit at least $5 of credits (Web Chat + SMS bot replies at the Haiku default cost ~$0.005-0.02 per exchange, so $5 covers ~250-1000 conversations). Then **Keys** → **Create API Key**. Paste here.

Write to `.env.local`:
- `OPENROUTER_API_KEY` — paste the key
- `AI_REPLIES_DEFAULT_MODEL` — optional. Leave blank to use Claude Haiku 4.5 (recommended). Override per channel later if you want to test other models.

Without this, the AI Agents settings page still loads but channels stay silent — every channel toggle is rejected with a friendly "Set the persona first" message that's actually masking the missing key.

#### Firecrawl (optional — powers AI Agent website KB)
Skip this if the buyer doesn't care about the bot referencing their clients' actual website content. The bot still works, it just falls back to "let me check with the team" for anything outside the persona prompt.

> Go to [firecrawl.dev](https://firecrawl.dev), sign up. The free tier covers a few hundred scrapes/month which is plenty since each sub-account only refreshes its KB on demand. Then **Dashboard** → **API Keys** → copy the `fc-…` key.

Write to `.env.local`:
- `FIRECRAWL_API_KEY` — paste the key. One agency-level key shared across all sub-accounts.

Once set, the AI Agents → Overview page exposes a "Refresh KB" button next to the website URL field. Clicking it scrapes the homepage (single-page, no crawl) and stores the markdown for the bot to reference.

#### Vapi (optional — powers the AI Voice Agent channel)
Skip this entire section if the buyer isn't enabling voice yet. SMS + Web Chat agents work without it. Voice attaches to the sub-account's **existing dedicated Twilio number** via Vapi BYOC (or to a Vapi-managed number if the buyer wants to skip Twilio regulatory bundles — useful for AU clients in particular).

> Sign up at [vapi.ai](https://vapi.ai). Top up at least $10 of credits — voice agent calls run ~$0.10–0.15/min through Vapi (Deepgram STT + ElevenLabs TTS bundled). Then **API Keys** → copy the **Private Key** (NOT the Public Key — that's for browser widgets which we don't use).

Write to `.env.local`:
- `VAPI_API_KEY` — paste the Private Key. One agency-level key shared across all sub-accounts.
- `VAPI_WEBHOOK_SECRET` — anything you generate locally, e.g. `openssl rand -base64 32`. We embed this in the URLs we register with Vapi (`?s=<secret>`) and our `/api/webhooks/vapi/*` routes verify it on every callback. Rotating it later requires re-saving every active sub-account's voice channel so our provisioning code pushes the new value to Vapi.

**Critical prerequisite — `NEXT_PUBLIC_APP_URL` must be publicly reachable from Vapi.** Vapi POSTs our LLM webhook every voice turn (custom-LLM mode). Locally that means a cloudflared / ngrok tunnel; in prod set it to your Vercel domain.

Once both keys + the public URL are set, sub-account operators can go to **AI Agents → Voice** to enable the channel. Two phone number modes:
- **My dedicated Twilio number (BYOC)** — reuses the sub-account's Twilio creds (configured under Settings → SMS). One number serves SMS + Voice with one Twilio bill. Vapi auto-updates the Twilio voice URL via BYOC registration. Production path.
- **A number I own in Vapi** — operator pastes the UUID of a phone-number resource they've already provisioned in their Vapi dashboard. Skips AU regulatory bundles; great for testing and for buyers who'd rather pay Vapi directly. We bind a LeadStack-managed assistant to the operator's number (any previously-attached assistant on that number gets replaced).

On save, our provisioning code creates or updates a Vapi assistant named `LeadStack sa:<id>` with `custom-llm` mode pointing at our LLM webhook. Every voice turn flows: caller → Vapi (Deepgram) → POST to our webhook → `resolveAgent()` + `buildSystemPrompt({channelId:"voice"})` + OpenRouter (Claude Haiku 4.5 by default) → SSE stream back → Vapi (ElevenLabs) → caller. On hangup Vapi runs structured-data extraction (name / email / callbackRequested / reason) and POSTs an end-of-call webhook; our handler creates Contact + Task + escalation email + `subAccounts/{id}/voiceCalls/{callId}` summary doc.

Cost footprint: ~$0.10–0.15/min on Vapi + per-token OpenRouter charges on our existing key. Total comfortably under $0.20/min for a typical call.

**Outbound Voice uses the same Vapi setup — no extra keys.** Once Voice is provisioned, the agency owner can additionally turn on **Outbound Voice** (the AI proactively dialing contacts) for a sub-account. It's a separate agency gate (`outboundVoiceEnabledByAgency`, flipped from the agency's `/agency/sub-accounts` → Manage dialog) because it spends Vapi minutes proactively and carries dialing-compliance responsibility. After the gate is on, the sub-account operator enables it under **AI Agents → Outbound Voice** (a distinct outbound persona + first message + calling window + caps), then either clicks the call button on a contact or launches a bulk campaign over a filtered audience. Before any call is placed, LeadStack's **native compliance gate** checks the contact's `voiceOptedOut` flag, a per-call consent acknowledgment, the calling window in the contact's local timezone, and per-minute/daily/per-number caps — all enforced in-app with no third-party dependency (a pluggable scrub provider is a no-op until the buyer wires a regional DNC service). **No new env vars** — outbound reuses `VAPI_*`, `QSTASH_*` (campaign fan-out), the dedicated Twilio number, and `NEXT_PUBLIC_APP_URL`. Buyers in regulated markets should confirm their own calling-consent obligations before enabling it.

#### Marketing tracking (Meta Pixel + GTM — optional)
Skip if the buyer doesn't run paid ads or doesn't care about analytics yet. Both vars are `NEXT_PUBLIC_*` so they're inlined at build time — changing them needs a redeploy.

> **Meta Pixel:** [Meta Events Manager](https://business.facebook.com/events_manager) → Data Sources → pick or create the Pixel → copy the numeric ID.
> **Google Tag Manager:** [tagmanager.google.com](https://tagmanager.google.com) → create a container → copy the `GTM-XXXXXXX` ID.

Write to `.env.local`:
- `NEXT_PUBLIC_META_PIXEL_ID` — numeric Pixel ID. When set, the Pixel loads on every page (landing + dashboard + hosted form pages) and form submissions auto-fire a `Lead` event client-side. UTM/fbclid/gclid/referrer/landing-page are stored on the contact regardless.
- `NEXT_PUBLIC_GTM_ID` — `GTM-XXXXXXX`. Use this as the escape hatch for any tracker Meta Pixel doesn't already cover (LinkedIn Insight, TikTok Pixel, Hotjar, custom server-side gtag, etc).

Both are fully optional and ship blank in `.env.example`. Once set, restart `pnpm dev` (env-var change requires a fresh boot in Next.js) — you should see the Pixel + GTM script tags in the page source.

#### Live chat (Crisp — optional but recommended)
LeadStack is wired to route every "talk to us" path through the Crisp widget instead of `mailto:` (pricing checkout-error fallback, privacy-policy contact line). Without Crisp configured, those buttons silently no-op — there's no `mailto:` fallback.

> [app.crisp.chat](https://app.crisp.chat) → create a free account → Settings → Website Settings → Setup Instructions → copy the Website ID (a UUID).

Write to `.env.local`:
- `NEXT_PUBLIC_CRISP_WEBSITE_ID` — the UUID.

If the buyer doesn't want Crisp specifically, they can either pick a different chat widget (Intercom, Tawk.to — swap the script in [src/app/layout.tsx](src/app/layout.tsx)) or replace `openCrispChat` calls in [src/lib/crisp.ts](src/lib/crisp.ts) with a `mailto:` or contact-form route they actually monitor.

### Phase 3.5: Local dev tunnel for automations + website polling

QStash needs a public HTTPS URL to call back into your app — `localhost:3000` is unreachable from the public internet. Without a tunnel, automations and website polling won't fire locally. Skip this phase if you're only testing the core CRM (contacts, pipeline, forms without automations, etc.).

You have two options. Both end with you having an HTTPS URL like `https://something.trycloudflare.com` or `https://abc-123.ngrok-free.app`. **Set `NEXT_PUBLIC_APP_URL` in `.env.local` to that URL** — QStash uses it to build callback URLs and the website-poll route reads its own URL from it.

#### Option A: Cloudflare Tunnel (recommended for the test loop)
- **Pros**: free, no signup needed for ad-hoc tunnels; named tunnels survive restarts so a single hostname can be saved into Twilio's webhook config and reused day after day.
- **Cons**: slightly more setup the first time.

Quick start (random hostname, rotates each run — fine for one-off testing):
```bash
cloudflared tunnel --url http://localhost:3000
```

Persistent named tunnel (recommended once you're past one-off testing):
```bash
cloudflared login                                # browser auth, one-time
cloudflared tunnel create leadstack-dev          # creates a tunnel ID
cloudflared tunnel route dns leadstack-dev leadstack-dev.YOUR-DOMAIN.com
cloudflared tunnel --name leadstack-dev --url http://localhost:3000
```
Re-run the last command anytime; the hostname stays the same.

#### Option B: ngrok
- **Pros**: fastest first-run; no account needed for basic use.
- **Cons**: free-tier hostname rotates each restart. Every restart breaks Twilio's saved webhook URL and any QStash callbacks already in flight.

Quick start:
```bash
ngrok http 3000
```
Copy the `https://….ngrok-free.app` URL and paste it into `NEXT_PUBLIC_APP_URL`.

#### After the tunnel is running
Update `.env.local`:
- `NEXT_PUBLIC_APP_URL=https://your-tunnel-hostname.example.com`

Then restart `pnpm dev` so the new value is picked up. Now go back to Twilio (Phase 3) and set the inbound webhook URL to `https://your-tunnel-hostname.example.com/api/webhooks/twilio/inbound`.

### Phase 4: Start the App

1. Run `pnpm dev`.
2. Open http://localhost:3000.
3. Walk through verification:
   - **Landing page** renders at `/` — confirm it shows the buyer's brand (`CUSTOM_BRAND.name` in the navbar + hero, their tagline, their pricing tiers). If you still see "LeadStack" anywhere, double-check that `CUSTOM_BRAND` was filled in at `src/config/landing.ts`.
   - **Theme toggle** switches light/dark.
   - **Signup** at `/signup` creates a user. Check Firebase Console → Authentication that the user appears.
   - **Dashboard** renders at `/dashboard` showing the "Getting Started" empty state.
   - **Add a contact** → it appears in `/contacts`.
   - **Open a deal** on that contact → drag it across pipeline stages.
   - **Create a calendar event** linked to the contact → check the timeline.
   - **Create a form** → copy the public link → submit it in an incognito tab → verify a new contact appears.
   - **Cmd/Ctrl + K** opens global search.
   - **Send email** from the contact profile (requires Resend vars). Verify inbox + blue "Email sent" activity.
   - **Send SMS** from the contact profile (requires Twilio vars). Verify phone + violet "SMS sent" activity.
   - **Upgrade** from `/#pricing` → Stripe checkout with test card `4242 4242 4242 4242`.
   - **Form auto-response** (proves QStash + automations work — needs the tunnel from Phase 3.5):
     - Sub-account → Forms → open or create a form → Automation panel → attach the **Speed-to-Lead** recipe with an SMS step + an email step containing `{{unsubscribeLink}}`.
     - Submit the form in an incognito tab using a real phone + email you can check.
     - SMS arrives within ~10s, email within ~30s. The email's "Unsubscribe" link should resolve and flip `contact.emailOptedOut = true`.
   - **Website build** (proves gitpage works — needs the tunnel from Phase 3.5):
     - Sub-account → Website → click **Sample** to prefill, then **Build site**.
     - Banner flips queued → building. Within 1–3 min you should see a green "Your site is live" banner with a `gitlab.io` or `github.io` URL.
   - **AI Agents → Web Chat** (proves OpenRouter + the widget pipeline work):
     - Sub-account → AI Agents → Overview → save the persona prompt (the default text is fine to start) and the business name. Optional: paste a website URL + click **Refresh KB** to confirm Firecrawl is wired.
     - Switch to the **Web Chat** tab → tick **Enable Web Chat** → set Allowed domains to `localhost` (for this local test) → **Save Web Chat settings**.
     - Copy the snippet and paste it into a tiny `test.html` file: `<html><body>Hello<script src="http://localhost:3000/widget.js" data-sa="..." async></script></body></html>`. Open it in a browser (`file://`) or serve via `python -m http.server 8080`. A bubble appears bottom-right; click → chat opens; send "can someone call me back" — within seconds you should see a real reply (proving OpenRouter works) and an inline form below it (proving the [[form]] marker pipeline works).
     - Fill the form → submit. Check Contacts (a new `source: "web-chat"` row), Tasks (a new "Follow up with…" row due today), and your inbox at the agent profile's escalation email (capture notification).
     - Sessions list lives at AI Agents → Web Chat → **Sessions** (top-right button).
   - **Quotes** (proves the quote → email → public-page → accept loop; uses Resend you already wired):
     - Sub-account → **Quotes** → **+ New quote** → pick a contact with a real email address you can check → fill 2-3 line items + a tax % + valid-until + terms → **Create draft**.
     - You land on the detail page with a `Q-2026-0001` number. Click **Send to recipient** — your real inbox should get a "Quote from {businessName}" email with a `View &amp; respond to quote` button.
     - Click the button in the email — you land on `/q/[token]` showing the quote. Click **Accept** — banner flips to "Quote accepted — thank you!" Back in the dashboard, the quote's status badge flips to Accepted and (because the default checkbox is on) a new Deal at the **Won** stage appears in the contact's Deals card with the quote total as value.
     - On the contact profile **Activity** column you should see a stack of new entries: `Quote sent`, `Quote opened by recipient`, `Quote accepted`, `Pipeline updated (auto)`.
     - Test the decline path on a second quote — the decline modal's reason picker writes the reason + note onto the quote, and the operator's detail-page timeline shows the reason.

### Phase 5: Deploy to Vercel (when ready)

1. Push to GitHub.
2. On https://vercel.com → Import repository.
3. Add **all** env vars from `.env.local` to Vercel → Project → Settings → Environment Variables. The full set:
   - Firebase client (`NEXT_PUBLIC_FIREBASE_*`) + admin (`FIREBASE_ADMIN_*`)
   - Cookie secrets (`COOKIE_SECRET_CURRENT`, `COOKIE_SECRET_PREVIOUS`)
   - `NEXT_PUBLIC_APP_URL`, `BOOTSTRAP_ADMIN_EMAIL`
   - Stripe (`STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)
   - Resend (`RESEND_API_KEY`, `EMAIL_FROM`) and Twilio (`TWILIO_*`)
   - QStash (`QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) and `AUTOMATIONS_TOKEN_SECRET`
   - gitpage (`GITPAGE_API_KEY`, optionally `GITPAGE_API_URL`)
   - AI Agents: `OPENROUTER_API_KEY` (required for bot replies) + optional `AI_REPLIES_DEFAULT_MODEL`
   - AI Agents KB: optional `FIRECRAWL_API_KEY` (powers the "Refresh KB" button on the agent profile)
   - AI Voice Agent: optional `VAPI_API_KEY` + `VAPI_WEBHOOK_SECRET` (powers the AI Agents → Voice channel). Skip both if you're not enabling voice yet.
4. For `FIREBASE_ADMIN_PRIVATE_KEY`, paste the full key including the `-----BEGIN/END-----` markers. Vercel handles the newlines automatically.
5. Deploy.
6. Update the Stripe webhook endpoint (Stripe dashboard → Webhooks) to point to `https://your-domain.vercel.app/api/webhooks/stripe` and copy the new signing secret into Vercel env vars.
7. Update Twilio's inbound webhook URL (Console → Phone Numbers → Active Numbers → "A MESSAGE COMES IN") to `https://your-domain.vercel.app/api/webhooks/twilio/inbound`. The local-tunnel URL won't be reachable in production.
8. Update `NEXT_PUBLIC_APP_URL` in Vercel env vars to the production URL.
9. Redeploy.
10. **AI Agents Web Chat snippets:** any client sites where the buyer pasted the snippet during local testing point at `http://localhost:3000/widget.js` — those need to be updated to `https://your-domain.vercel.app/widget.js`. Also re-visit each sub-account → AI Agents → Web Chat and update **Allowed domains** to the real hostnames of each client's production site (not `localhost`).
11. **AI Voice Agent:** if any sub-account had Voice enabled during local testing, the linked Vapi assistant has the **cloudflared tunnel URL** baked in for `model.url` + `server.url`. Open each sub-account's AI Agents → Voice and click **Save voice settings** — that re-PATCHes the Vapi assistant with the production `NEXT_PUBLIC_APP_URL`. Without this, calls would still hit the now-dead tunnel and Vapi would log `getaddrinfo ENOTFOUND` errors. The `VAPI_WEBHOOK_SECRET` value in Vercel **must match** the one used locally so previously-provisioned assistants keep authing correctly.

### Troubleshooting Tips

Common issues and fixes:
- **pnpm not found** — `npm install -g pnpm`, restart terminal.
- **Wrong directory** — make sure you're in the folder with `package.json`.
- **Blank page / 500 errors** — `.env.local` likely has a missing or malformed value. Read it; look for empty keys.
- **Auth not working** — in Firebase Console confirm Email/Password provider is enabled.
- **"Permission denied" in Firestore** — `firebase deploy --only firestore:rules,firestore:indexes` wasn't run, or `.firebaserc` points to the wrong project.
- **Port 3000 in use** — `pnpm dev -- -p 3001`.
- **Private key issues** — `FIREBASE_ADMIN_PRIVATE_KEY` must be in double quotes, with literal `\n` escapes (not real newlines).
- **Stripe webhook not firing** — `stripe listen` needs to be running in a second terminal for local testing.
- **Resend 403 at send time** — the `EMAIL_FROM` address is on a domain that isn't verified in Resend. Check Resend → Domains.
- **Twilio "unverified number" error** — trial accounts can only SMS phones you've verified in Twilio → Phone Numbers → Verified Caller IDs.
- **Comms buttons disabled** — contact has no email or no phone. Edit the contact, add the field, save.
- **Cmd+K doesn't open** — make sure you're on a `/dashboard` / `/contacts` / etc. page (not the public landing page).
- **Form submit succeeds but no SMS/email auto-response** — QStash isn't configured, signing keys mismatch the region, or `NEXT_PUBLIC_APP_URL` doesn't match the public tunnel. Check Vercel/local logs for `/api/automations/step` returning 503 or 401, and verify `QSTASH_URL` matches the region of `QSTASH_TOKEN`.
- **Unsubscribe link returns 404** — `AUTOMATIONS_TOKEN_SECRET` was rotated; old links are invalidated by design. The user has to receive a new email; old ones can't be revived.
- **Twilio STOP not flipping `smsOptedOut`** — Twilio's "A MESSAGE COMES IN" webhook URL isn't pointing at `/api/webhooks/twilio/inbound`, or it points at a stale tunnel hostname after a restart. Refresh the URL in the Twilio console.
- **Website build hangs at "queued"** — the QStash callback can't reach your app. Check `NEXT_PUBLIC_APP_URL` matches the tunnel/Vercel domain, and that the QStash dashboard shows the poll messages with `DELIVERED` status.
- **Website build "ready" but no live URL in the UI** — Firestore rules for the website subcollection weren't deployed. Run `firebase deploy --only firestore:rules,firestore:indexes`.
- **Public booking page renders but availability fails with "Couldn't load availability" / 500** — almost always a missing Firestore composite index in production. The availability endpoint runs `where("subAccountId", "==", X).where("startAt", ">=", Y).where("startAt", "<=", Z)`, which requires the `events(subAccountId, startAt)` composite index declared in `firestore.indexes.json`. Indexes deploy separately from rules — run `firebase deploy --only firestore:rules,firestore:indexes` (both flags). Indexes take a few minutes to BUILD after deploy; watch progress in the Firebase Console → Firestore → Indexes tab. Vercel logs for `/api/booking/[saId]/[slug]/availability` will show `[booking/availability] events query failed sa=... slug=... requires an index` when this is the cause.
- **ngrok hostname keeps rotating** — switch to a named cloudflared tunnel (Phase 3.5 Option A), or upgrade ngrok to a paid plan with a reserved domain.
- **AI Agents channel toggle won't enable** — "Set the persona first" error means `aiAgent/profile.systemPrompt` is empty for that sub-account. Open AI Agents → Overview, fill in the persona prompt (or leave the pre-filled default), click Save profile, then retry the channel toggle.
- **Web Chat widget doesn't render on the client's site** — likely the parent-page hostname isn't in the channel's `webChat.allowedDomains`. The widget loader receives `{enabled: false}` from `/api/web-chat/config` and silently no-ops. Check the browser console for the config response and add the missing hostname under AI Agents → Web Chat → Allowed domains.
- **Web Chat returns "I had trouble reaching the server"** — most often `OPENROUTER_API_KEY` is missing or out of credits; server logs show `[web-chat/respond] LLM call failed`. Also possible: rate limit hit (60/IP/hour or 30/session) — logs return 429 with a Retry-After header.
- **Refresh KB button returns 503** — `FIRECRAWL_API_KEY` isn't set on the deployment. The KB is optional; either set the key or live without site-aware bot context.
- **Refresh KB returns 502 with a Firecrawl error** — usually the URL is paywalled, behind Cloudflare anti-bot, or returned a 404. Try a simpler URL (the bare domain root) or check the site is publicly accessible without JS.
- **Captured a Web Chat lead but no follow-up email arrived** — the agent profile's `escalationNotifyEmail` is blank (or Resend isn't configured). The Task still creates, only the email is skipped. Set the email on AI Agents → Overview → "Default escalation email" or use the per-channel override.
- **Inline capture form doesn't appear after asking for details** — the bot didn't emit the `[[form fields="…"]]` marker. Open AI Agents → Overview → "Test this persona" and ask the same question — if the marker doesn't appear in your test reply, the persona prompt may be overriding the safety-rail instructions (e.g. "always be concise" can suppress markers). Tweak the persona to not contradict the lead-capture instructions.
- **Voice channel enable returns 503 "Vapi isn't configured"** — `VAPI_API_KEY` or `VAPI_WEBHOOK_SECRET` missing on the deployment. Set both, redeploy (Vercel doesn't hot-reload env vars), retry the save.
- **Voice channel enable returns 400 "Configure your dedicated Twilio number first"** — BYOC mode requires the sub-account's `twilioConfig.enabled === true`. Either configure Settings → SMS first, or switch the Voice phone-number source to "A number I own in Vapi" + paste a Vapi phone-number UUID.
- **Voice channel enable returns 400 "Paste your Vapi phone number ID"** — vapi-managed mode requires the operator to paste the UUID of a phone-number resource they've already created in their Vapi dashboard. Find it under Vapi → Phone Numbers → click the number → the UUID is shown directly under the +1/+61 number.
- **Voice channel saved but call rings and drops with `error-providerfault-custom-llm-llm-failed`** — Vapi can't reach our LLM endpoint. Check Vercel logs filtered to `/api/webhooks/vapi/llm/` — if you see 401, the assistant has a stale `VAPI_WEBHOOK_SECRET` baked into the URL; re-save voice settings to push the current value. If you see 404 / DNS errors, `NEXT_PUBLIC_APP_URL` is wrong on Vercel.
- **Voice call connects, greeting plays, but bot stays silent on every reply** — Vapi expects an SSE stream from custom-LLM. Our route already streams (see `openAiSseStream` in the LLM route); if you see this symptom on a fork or after refactor, confirm the LLM route returns `Content-Type: text/event-stream` with `data: …` chunks, not non-streaming JSON.
- **Voice bot speaks the `[[capture]]` marker syntax out loud** — the LLM route's `stripVoiceUnspeakables()` should be removing markers + asterisks before SSE-streaming. If markers leak through, check whether the voice safety rails in `prompt.ts` accidentally instruct the model to emit a marker — they shouldn't, voice relies on Vapi's `analysisPlan.structuredDataPlan` post-call extraction instead.
- **Voice call ends but no Task / Contact / voiceCalls doc created** — Vapi didn't send the end-of-call-report webhook. Check the Vapi call's logs panel for `category: "webhook" messageType: "end-of-call-report"`. If absent, the assistant's `serverMessages` list is missing `end-of-call-report` — re-save voice settings to push the explicit list (`["end-of-call-report", "status-update", "hang"]`) to Vapi.
- **Voice calls page shows "No calls yet" but Tasks exist** — Firestore rules for the `voiceCalls` subcollection weren't deployed. Run `firebase deploy --only firestore:rules,firestore:indexes`. The Firestore client SDK swallows permission-denied errors and renders the empty state.
- **Vapi assistant shows "Unsaved changes — publish to apply" after every PATCH** — our provisioning sets `analysisPlan.structuredDataPlan.messages` + `server.timeoutSeconds` explicitly to avoid this. If the banner reappears, re-save voice settings; one of those fields drifted on Vapi's side and our PATCH re-anchors them.
- **Quotes "Send" returns 503** — `RESEND_API_KEY` or `EMAIL_FROM` isn't set on the deployment. The Quotes builder still works locally (drafts save fine), only the send is gated. Configure Resend then retry — quote stays in draft state, click Send again.
- **Public /q/[token] page returns 404** — three things to check, in order. (1) Token is malformed or expired (operator may have re-sent, invalidating this link). (2) `firestore.rules` hasn't deployed since adding the `quotes/{id}` block — run `firebase deploy --only firestore:rules,firestore:indexes`. (3) `AUTOMATIONS_TOKEN_SECRET` was rotated since the email was sent (rotation invalidates every outstanding token by design). Solution: operator re-sends from the quote detail page to mint a fresh token.
- **Quote accepted but no Deal appeared at "Won"** — either `autoCreateDealOnAccept` was unchecked on the quote (it's per-quote, default on), or the deal write blipped (logged but not surfaced to the recipient — they see "accepted" regardless). Check the contact's pipeline column manually. Operator can create the deal by hand if it's missing — no automated retry in v1.
- **Quote-triggered automation never fires sends** — known v1 limitation. The trigger types (`quote_sent`, `quote_accepted`, etc.) dispatch correctly into `fireTriggers()` and create the execution doc, but the only `recipeType` shipped is `instant_response` which only handles `form_submit` in `computeFirstStepDelay()`. v2 will either extend instant-response or add a quote-aware recipe. For now, hand-wired automations via direct Firestore edit will register but never send.
- **Firestore "INTERNAL ASSERTION FAILED (ca9)" in browser console** — the `quotes/{id}` rules block is missing from `firestore.rules` (or wasn't deployed). The Firestore client SDK's onSnapshot stream gets denied and surfaces this opaque error. Run `firebase deploy --only firestore:rules,firestore:indexes` to fix.
