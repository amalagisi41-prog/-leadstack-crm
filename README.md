# Your Agency CRM

A production-ready, multi-tenant CRM you can brand as your own and resell to your clients. Styled after GoHighLevel and HubSpot, scoped for small agencies. Self-hosted on your own infrastructure — no recurring platform fees, no per-contact tiers, no per-message tax.

> **Read first.** This boilerplate is shipped to you as source code with a white-label landing page ready to brand. **First time here?** Work through [SETUP.md → Phase 1](SETUP.md#phase-1-tools--repo-access) to generate your *own* private copy of this template and open it in VS Code — that's the starting point. Then open [src/config/landing.ts](src/config/landing.ts) and fill in `CUSTOM_BRAND` (business name, tagline, support email, pricing tiers) before you deploy. **Easiest path: open this project in VS Code, install the Claude Code extension, and ask Claude `help me set up this project`** — it walks you through branding, Firebase, Stripe, Resend, Twilio, QStash, gitpage, and Vercel one step at a time. See [SETUP.md](SETUP.md) for the manual flow.

## What you're running

A two-tier multi-tenant CRM:

- **Agency** — your top-level workspace. One per deployment. You're the agency owner.
- **Sub-accounts** — one isolated workspace per client. Each has its own contacts, deals, pipeline, calendar, tasks, forms, automations, broadcasts, and (optionally) its own Twilio number. URL-scoped at `/sa/[subAccountId]/...`.
- **Members** — invite collaborators per sub-account with `subAccountAdmin` (full read/write + member management) or `subAccountCollaborator` (read/write only) roles.
- **Agency feature gates** — resource-consuming features (dedicated email domain, Public API, broadcasts, WhatsApp, Outbound Voice) are off by default and only the agency owner can flip them on per sub-account, so a client can't accidentally enable something that spends your credits or reputation.

## What's Included

| Surface | What it does |
|---|---|
| **Landing page (white-label)** | Branded with your details — edit `CUSTOM_BRAND` in `src/config/landing.ts`. |
| **Auth** | Email/password signup + login + session cookies. First signup (matching `BOOTSTRAP_ADMIN_EMAIL`) becomes the agency owner; subsequent signups require a typed invite. |
| **Agency dashboard** | Sub-account picker + create new sub-account flow. |
| **Sub-account dashboard** | Live KPIs, pipeline snapshot, recent activity, quick actions. |
| **Contacts** | List + search, CRUD, notes + activity timeline, CSV import/export, bulk-email action. |
| **Pipeline** | 6-stage Kanban (`@dnd-kit`), drag-drop deals, lost-reason prompt. |
| **Calendar** | Month grid, manual events, optional contact link. |
| **Tasks** | Today / Overdue / Upcoming / Done tabs, due-today sidebar badge. |
| **Forms** | Drag-order builder, 6 field types, public hosted page at `/f/[id]`, iframe embed, auto-creates contact + optional deal on submit. |
| **Reports** | Date-range KPIs, pipeline funnel, won-revenue area chart, leads-by-source donut. |
| **Cmd+K global search** | Across contacts, deals, tasks, events, forms. |
| **Email** | Shared-sender via Resend (your verified domain), `Reply-To:` user's email so replies bypass the app. |
| **SMS** | Shared-sender via Twilio (env-var creds) **OR** per-sub-account dedicated Twilio (real-time inbound chat thread on the contact profile, opt-in per sub-account). |
| **Automations** | Speed-to-Lead recipe — SMS + email + owner notification on form submit. QStash-backed scheduling, send-window respect, HMAC-signed unsubscribe links. |
| **Broadcasts** | Bulk email to a filtered audience (all / tag / pipeline stage). Reuses automations infra; live per-recipient status. Hard cap 25k recipients. |
| **AI Agents — one persona, every channel** | A single AI agent (persona + business hours + escalation rules + optional website knowledge base) answers across multiple channels per sub-account. Captures auto-create a follow-up Task + escalation email. Powered by OpenRouter (any model, Claude Haiku 4.5 by default). |
| **AI Agents — Web Chat** | Embeddable own-brand chat widget (one-line `<script>` snippet → floating bubble + iframe). Inline lead-capture form, live operator console with transcripts. |
| **AI Agents — SMS & WhatsApp** | AI auto-replies to inbound SMS and (beta) WhatsApp on the sub-account's dedicated Twilio number/sender. Real-time chat thread on the contact profile; WhatsApp template manager for messaging outside the 24h window. |
| **AI Agents — Voice (inbound)** | AI answers inbound phone calls on the same Twilio number (via Vapi), qualifies the lead, books a callback. Call summaries + transcripts in an operator console. |
| **AI Agents — Outbound Voice** | The AI proactively dials contacts — single click-to-call from a contact, or a bulk campaign over a filtered audience. Native dialing-compliance gate (opt-out, consent, calling window, rate caps) before any call is placed. |
| **Quotes** | GHL-style estimates — line-itemed quote, branded email, public accept/decline page. Year-prefixed numbering, multi-currency, auto-creates a Won deal on accept. PDF download. |
| **Booking pages** | Native Calendly-style slot picker per sub-account at `/b/[saId]/[slug]`. ICS-attached confirmation emails, reschedule/cancel links, reminders, optional paid bookings. |
| **Products & Invoices** | Reusable product catalog + an invoice document type (shares the Quotes engine). Per-sub-account PayPal.me payment links; mark-paid flow. |
| **Public API + webhooks** | Versioned REST surface under `/api/v1/*` (contacts/deals/tasks/events/form submissions) + signed outbound webhooks. Per-sub-account API keys, idempotency, rate limits — plug into Zapier/Make/n8n. |
| **Leads map** | Mapbox world map on the dashboard with clustered pins. Location captured server-side at form submit. |
| **Website builder** | Each sub-account can publish a marketing site via gitpage.site (LocalSite or VSL funnel). Long sectioned form → queued build → live URL within minutes. |
| **Billing** | Stripe checkout + customer portal + webhooks. Pro recurring price ID shipped; rewire `src/lib/stripe/checkout.ts` for your model. |
| **Marketing tracking** | Drop in your Meta Pixel ID and/or Google Tag Manager container ID via env vars — both load site-wide (landing + hosted forms + dashboard). Form submissions auto-fire the Meta `Lead` event. GTM is the escape hatch for LinkedIn, TikTok, Hotjar, etc. |
| **Lead attribution** | Every public form submission captures `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`, `gclid`, document referrer, and landing URL — stored on the contact's `attribution` field. Source falls back to `utm_source` when present. |
| **Live chat** | Optional Crisp Chat integration. Every "talk to us" path on the landing page routes through Crisp rather than `mailto:` — swap in any chat tool by editing one file. |
| **Settings** | Profile, theme, subscription, members, per-sub-account Twilio + WhatsApp config, send-window, API keys, outbound webhooks, PayPal payment links, CSV export. |

## Tech Stack

- **Next.js 15** — App Router, TypeScript, Turbopack
- **Firebase** — Authentication + Cloud Firestore + Admin SDK
- **`next-firebase-auth-edge`** — Session cookie auth at the edge
- **Stripe** — Checkout + Customer Portal + Webhooks
- **Resend** — Shared-sender email
- **Twilio** — Shared-sender + per-sub-account dedicated SMS, WhatsApp sender, and Voice (BYOC) number
- **OpenRouter** — LLM gateway for the AI Agents (one key → any model; Claude Haiku 4.5 default)
- **Vapi** — Realtime voice pipeline for the inbound + Outbound Voice AI channels
- **Firecrawl** — Optional website-homepage scrape powering the AI Agent knowledge base
- **Upstash QStash** — Message queue for automation steps, broadcast/campaign fan-out, website build polling
- **Mapbox** — Optional leads map on the dashboard
- **PayPal.me** — Per-sub-account payment links for invoices + paid bookings
- **gitpage.site** — Per-sub-account website builder
- **`@dnd-kit`** — Kanban drag-drop
- **`@tanstack/react-table`** — Contacts table
- **Tailwind CSS v4** + **shadcn/ui** — Theming with Geist Sans + Instrument Serif
- **Meta Pixel + Google Tag Manager** — Optional site-wide tracking scripts (script-tag pattern; both load via env var, both load `<noscript>` fallbacks)
- **Crisp Chat** — Optional live-chat widget; used as the primary support channel in place of `mailto:`
- **Vercel** — One-click deploy target

## Quick Start

> **Don't have your own copy yet?** Follow [SETUP.md → Phase 1](SETUP.md#phase-1-tools--repo-access) to generate a private repo from this template and open it. Then: full step-by-step in [SETUP.md](SETUP.md), or open the project in VS Code with the Claude Code extension and type `help me set up this project` to be guided.

```bash
pnpm install
cp .env.example .env.local
# Fill in every value in .env.local — see SETUP.md
firebase login
firebase use <your-firebase-project-id>
firebase deploy --only firestore:rules,firestore:indexes
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### What you need before you start

- Node.js 20+ (LTS; Node 18 is end-of-life)
- pnpm (`npm install -g pnpm`)
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project (Auth + Firestore enabled)
- A Stripe account (test mode for dev)
- A Resend account + verified sending domain (optional — email disables gracefully if missing)
- A Twilio account + phone number (optional — SMS disables gracefully if missing)
- An Upstash QStash account (optional — automations, broadcasts, voice campaigns + website-builder polling disable gracefully if missing)
- An OpenRouter API key (optional — powers the AI Agents on every channel; channels stay silent if missing)
- A Vapi account (optional — powers the inbound + Outbound Voice AI channels; the Voice toggle 503s if missing)
- A Firecrawl API key (optional — powers the AI Agent website knowledge base; the bot still works without it)
- A Mapbox token (optional — powers the dashboard leads map; location is still captured without it)
- A gitpage.site agency API key (optional — website builder disables gracefully if missing)
- A Meta Pixel ID and/or Google Tag Manager container (optional — both load only when set; UTM/fbclid capture works regardless)
- A Crisp Chat website ID (optional — chat widget + "talk to us" CTAs silently no-op if missing)

### Brand the landing page

Open [src/config/landing.ts](src/config/landing.ts) and fill in `CUSTOM_BRAND` with your business name, tagline, support email, primary domain, and pricing tiers. Your branded landing page renders at `/`.

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Production server |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format with Prettier |
| `firebase deploy --only firestore:rules,firestore:indexes` | Deploy security rules + composite indexes (re-run whenever you add a collection or compound query) |

## Project Structure

```
src/
├── app/
│   ├── (auth)/                       Login + Signup
│   ├── (legal)/                      Terms + Privacy
│   ├── (dashboard)/
│   │   ├── agency/                   Agency landing + sub-account picker
│   │   └── sa/[subAccountId]/        Per-sub-account CRM (dashboard, contacts,
│   │                                 pipeline, calendar, tasks, forms, quotes,
│   │                                 products, reports, automations, broadcasts,
│   │                                 ai-agents, website, settings)
│   ├── f/[formId]/                   Public hosted form
│   ├── b/[saId]/[slug]/              Public booking page (slot picker)
│   ├── q/[token]/                    Public quote accept/decline page
│   ├── (embed)/embed/chat/[saId]/    AI Web Chat widget iframe target
│   ├── u/[token]/                    Public unsubscribe landing
│   ├── thank-you/                    Post-signup landing
│   └── api/
│       ├── auth/                     Signup + refresh-claims
│       ├── agency/                   Agency PATCH + sub-account CRUD + feature gates
│       ├── sub-accounts/[id]/        Invites, members, twilio, whatsapp, website,
│       │                             quotes, products, ai-agent, api keys, webhooks
│       ├── contacts/[id]/            DELETE (cascading)
│       ├── forms/[id]/submit/        Public submission
│       ├── comms/{email,sms,whatsapp,voice}/   Auth-required send + call routes
│       ├── automations/step/         QStash callback (one recipe step)
│       ├── broadcasts/email/         Bulk email send + per-recipient step
│       ├── booking/[saId]/[slug]/    Public availability + book
│       ├── quotes/[token]/respond/   Public quote accept/decline
│       ├── web-chat/                 Public widget config + message + capture
│       ├── v1/                       Public REST API (keys + webhooks)
│       ├── u/[token]/                Unsubscribe flip
│       ├── cron/gitpage-heartbeat/   Daily telemetry + status cache
│       └── webhooks/                 Stripe + Twilio (SMS + WhatsApp) + Vapi (voice)
├── components/
│   ├── ui/                shadcn/ui primitives
│   ├── landing-custom/    White-label marketing page (reads CUSTOM_BRAND)
│   ├── agency/            Agency landing + SA switcher + manage (feature gates)
│   ├── dashboard/         Sidebar + Header + Cmd+K trigger
│   ├── contacts/ pipeline/ calendar/ tasks/ forms/ reports/
│   ├── quotes/            Builder + list + detail + public accept/decline view
│   ├── ai-agents/         Channel nav + persona + per-channel sections + consoles
│   ├── web-chat/          Self-contained chat window rendered in the embed iframe
│   ├── automations/       Recipe + template UI
│   ├── search/            Cmd+K palette
│   └── settings/          Members, Twilio, API keys, webhooks, PayPal config
├── config/
│   └── landing.ts         CUSTOM_BRAND (white-label config)
├── lib/
│   ├── firebase/          Client + admin SDK + auth helpers
│   ├── stripe/            Checkout + portal + webhooks
│   ├── comms/             Resend + Twilio + per-SA config + route-auth + usage
│   ├── comms/ai/          AI Agent profile/channel resolver + SMS orchestrator + prompt
│   ├── comms/web-chat/    Web Chat session + orchestrator + capture + follow-up
│   ├── comms/voice/       Vapi client + outbound compliance gate + campaigns
│   ├── comms/whatsapp/    WhatsApp templates (Content API) + starter gallery
│   ├── firecrawl/         Agency-level homepage scrape (AI Agent KB)
│   ├── quotes/            Money math + token + numbering + email + lifecycle
│   ├── booking/           Availability + reconcile + ICS + lifecycle
│   ├── api/               Public API auth, keys, idempotency, rate limit, webhooks
│   ├── paypal/            PayPal.me payment-link builder
│   ├── firestore/         CRUD helpers per collection
│   ├── automations/       Triggers, executor, QStash, merge tags, tokens
│   ├── broadcasts/        Audience filter resolution
│   ├── gitpage/           Client SDK + heartbeat telemetry
│   ├── website/           gitpage dropdown values, niche templates, validation
│   ├── attribution.ts     Browser UTM/fbclid/referrer capture + Meta Pixel Lead helper
│   ├── crisp.ts           Typed openCrispChat() wrapper (no-op when widget not loaded)
│   ├── auth/              require-admin + require-tenancy guards
│   └── health/            Liveness checks
├── hooks/                 useAuth, useSubAccount, useDueTodayCount
├── context/               AuthContext + SubAccountContext
├── types/                 Per-domain types
└── middleware.ts          Auth gating (next-firebase-auth-edge)

public/widget.js           Vanilla JS loader for the AI Web Chat widget
instrumentation.ts         Cold-start gitpage heartbeat + QStash schedule registration
firestore.rules            Tenancy + role-based security rules
firestore.indexes.json     Composite indexes (deploy alongside rules)
firebase.json              Deploys firestore.rules + indexes
```

## Firestore Collections

All collections are **tenancy-scoped** via `firestore.rules`. Every CRM doc carries `agencyId`, `subAccountId`, `createdByUid`; the rules check the caller's `subAccountMembers/{uid}` row (or the agency-owner shortcut) before allowing reads/writes.

| Collection | Notes |
|---|---|
| `agencies/{id}` + `/agencyMembers/{uid}` | Agency profile, billing, owner/staff list |
| `subAccounts/{id}` + `/subAccountMembers/{uid}` | Workspace metadata, send-window, Twilio config, per-SA membership rows |
| `subAccounts/{id}/website/{siteId}` | gitpage.site build config + status — up to 5 per sub-account (legacy `main` is one slot) |
| `userMemberships/{uid}/subAccounts/{saId}` | Denormalized index for the sub-account switcher |
| `users/{uid}` | Slim profile (display name, photo, primary agency) |
| `appConfig/main` | Bootstrap singleton (first agency owner) |
| `system/heartbeat`, `system/gitpageStatus` | Telemetry + cached subscription status |
| `invites/{auto}` | Typed invites with subAccountId + role |
| `contacts/{id}` + `/notes` + `/activities` + `/messages` + `/whatsappMessages` | CRM contacts (`messages` = SMS thread, `whatsappMessages` = WhatsApp thread, when dedicated Twilio is on) |
| `deals/{id}` | Pipeline deals (1 contact → many deals) |
| `tasks/{id}` `events/{id}` `forms/{id}` | Todos, calendar events (incl. bookings), form configs |
| `forms/{id}/submissions/{id}` | Inbound submissions (server-write only) |
| `automations/{id}` + `message_templates/{id}` + `automation_executions/{id}` | Recipe configs, reusable email/SMS templates, per-firing run rows |
| `broadcasts/{id}/sends/{contactId}` | Bulk email batches with per-recipient status |
| `quotes/{id}` | Quotes + invoices (line items, lifecycle, public token hash) |
| `products/{id}` | Per-sub-account product catalog (snapshotted into quote/invoice line items) |
| `subAccounts/{id}/bookingPages/{pageId}` | Booking page config (slug, hours, duration, price) |
| `subAccounts/{id}/aiAgent/{profile,channelId}` | Shared AI persona + per-channel config (sms, web-chat, whatsapp, voice) |
| `subAccounts/{id}/webChatSessions/{id}` + `/messages` | Web Chat threads + transcripts |
| `subAccounts/{id}/voiceCalls/{callId}` | Voice call summaries + transcripts (inbound + outbound) |
| `voiceCampaigns/{id}/recipients/{contactId}` | Bulk Outbound Voice campaigns with per-recipient status |
| `subAccounts/{id}/whatsappTemplates/{id}` | WhatsApp message templates (Meta approval status) |
| `subAccounts/{id}/apiKeys/{id}` + webhook subscriptions | Public API keys + outbound webhook subscriptions |
| `usage/{subAccountId}/...` | Email + SMS quota counters |
| `mail/{id}` | Firebase Trigger-Email extension queue |

## Deployment

**Local → Vercel** with all env vars copied from `.env.local`. Full walkthrough in [SETUP.md → Phase 5](SETUP.md#phase-5-run-locally--push-to-live), including:

- Stripe webhook endpoint pointing at production
- Twilio inbound webhook URL pointing at production
- `NEXT_PUBLIC_APP_URL` set to your Vercel domain (QStash + gitpage callbacks read this)

## Security Notes

- **Zero embedded secrets.** Every credential is user-provided via env vars. `.env*` is gitignored except `.env.example`.
- **Tenancy-scoped Firestore rules.** Caller's `subAccountMembers/{uid}` doc (or agency-owner claim shortcut) controls access on every read/write.
- **Admin SDK guarded.** `lib/firebase/admin.ts` uses `import "server-only"` so it can never leak into the client bundle.
- **Public write paths** (`/api/forms/[id]/submit`, `/api/u/[token]`, QStash callback routes, Stripe + Twilio webhooks) all validate input, signature-verify where applicable, and use the admin SDK to bypass rules cleanly.
- **HMAC-signed unsubscribe links** prevent forgery; rotating `AUTOMATIONS_TOKEN_SECRET` invalidates all outstanding links.
- **CAN-SPAM compliance**: every email body (one-off + bulk) is validated to contain `{{unsubscribeLink}}` before sending.

---

## License

Licensed under the [PolyForm Perimeter License 1.0.0](https://polyformproject.org/licenses/perimeter/1.0.0). You may use, modify, and self-host this codebase for your own business and your clients with no time limit and no recurring fee — but you may not redistribute or resell it as a product that competes with the original. Full text in [LICENSE.md](LICENSE.md).
