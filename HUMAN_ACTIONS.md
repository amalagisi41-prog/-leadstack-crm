# Human Actions

Everything below the code can't do for you — accounts, approvals, and
external registrations. **Ordered by lead time, longest first**, so you
start the slow ones today and don't end up blocked on them the day you
actually want to go live.

Every item maps to a section in [CLAUDE.md](./CLAUDE.md)'s Onboarding Guide
(Phase 3) — this is the "start the clock now" checklist version of that
guide, not a replacement for it.

## 🔴 Critical path — start this first

### 1. Twilio A2P 10DLC registration

**Lead time: 3–10 business days**, sometimes longer for real estate /
regulated verticals or a first-time filer. This is the single slowest thing
on this list and it gates the feature the whole Method Template Library is
built around — all four shipped templates (New Lead Instant Response, Missed
Call Textback, Cold Lead Revival, Post-Closing Review Request) send SMS.
Without A2P registration, Twilio trial/unregistered numbers are throttled,
filtered by carriers, or blocked outright at real volume.

- Register a **Brand** (your business identity) and a **Campaign** (what
  you're sending and why — "customer care / mixed" is the usual fit for a
  CRM) in the Twilio Console under Messaging → Regulatory Compliance.
- You'll need: legal business name, EIN/business registration number,
  business address, and a sample of the actual message copy you'll send
  (the Method Template bodies work as your samples).
- **Do this before you need to send real SMS to real leads.** Everything
  else on this list can be done same-day; this one can't.

## 🟡 Medium lead time — start within the first day or two

### 2. Meta App Review (Messenger + Instagram DM inbox, Social Planner posting)

**Lead time: several days to 2+ weeks**, and rejections that require a
resubmission are common on a first pass. Only needed if you're turning on
the Facebook/Instagram inbox or Social Planner (both agency-gated, off by
default) — skip this entirely if you're not using those.

- Create a Meta app at developers.facebook.com, submit for review on
  `pages_messaging` (+ `pages_manage_posts` / `instagram_content_publish` if
  you also want Social Planner posting).
- Until approved, only app admins/testers can connect a Page — fine for
  your own testing, not for a real client's account.

### 3. Custom domain DNS (Resend sending domain + a client's website)

**Lead time: minutes to 48 hours**, depending on the registrar and how
quickly DNS propagates. Two separate uses, do them together if you're doing
either:

- **Resend sending domain** (Domains → Add Domain) — lets outbound email
  come from your own brand instead of a shared sender. Add the DNS records
  Resend shows you, then wait for verification.
- **A client's custom domain** for the Website Builder / booking pages —
  point their domain's DNS at the values shown on the `/domain` page. Some
  registrars propagate in minutes; others (especially if a client is
  transferring registrars) can take up to 48 hours.

## 🟢 Same-day — do these when you sit down to set up

Everything below is a signup + copy-paste-a-key job, typically minutes each.
Full step-by-step for each is in CLAUDE.md's Onboarding Guide.

| # | Action | Powers |
|---|---|---|
| 4 | Create a Firebase project, enable Email/Password auth, create Firestore in production mode | The whole app — nothing boots without this |
| 5 | Generate a Firebase Admin service-account key | Server-side Firestore access |
| 6 | Run `firebase deploy --only firestore:rules,firestore:indexes` | Every feature that queries Firestore — **re-run this any time you pull new commits that touch rules or indexes** (indexes take a few minutes to finish building after deploy) |
| 7 | Create a Stripe account, get test-mode API keys, create your Pro-plan price | Billing |
| 8 | `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (local) or set the webhook endpoint in Stripe (prod) | Subscription state sync |
| 9 | Create a Resend account, get an API key | All outbound email — Method Template sends, quotes, briefings, digests, magic links |
| 10 | Create a Twilio account, buy a phone number, copy Account SID + Auth Token | All SMS — same caveat as #1, this gets you sending, A2P gets you sending *reliably* |
| 11 | Set the Twilio inbound webhook URL (`/api/webhooks/twilio/inbound`) on your number | STOP/START opt-out compliance + inbound SMS AI replies |
| 12 | Create an Upstash QStash account, copy the 4 QStash env vars (match the region!) | Every scheduled/delayed job: Method Template steps, the morning brief, the weekly digest, website-builder polling |
| 13 | Generate `AUTOMATIONS_TOKEN_SECRET` and both `COOKIE_SECRET_*` values (`openssl rand -base64 32`, run 3×) | Unsubscribe-link + quote-link signing, session cookies |
| 14 | Create an OpenRouter account, deposit ~$5, get an API key | Every AI Agent reply (SMS, Web Chat, Voice) |
| 15 | Get a gitpage.site agency API key | The Website Builder |

## ⚪ Optional — only if you're using the feature

| Action | Powers | Skip if |
|---|---|---|
| Vapi account + API key + webhook secret, ~$10 credit | Inbound Voice + Outbound Voice AI calling | You're not enabling the Voice channel |
| OpenAI API key (separate from OpenRouter) | Knowledge Base v2 retrieval (RAG) — embeddings | You're not adding KB sources beyond manual Q&A/pasted text |
| Firecrawl API key | Knowledge Base "webpage" / "crawl a site" sources | You're only using manual Q&A/pasted-text KB sources |
| Crisp Chat website ID | The in-app "chat with us" support widget | You're wiring your own support channel instead |
| Meta Pixel ID / GTM container ID | Ad-platform conversion tracking | You're not running paid ads yet |
| GitHub fine-grained PAT + org/team slugs | Post-payment automatic repo-access invite on `/thank-you` | You're inviting buyers to the repo manually |
| cloudflared or ngrok | Local testing of anything QStash-driven (automations, website builds, the morning brief/digest, KB ingestion) | You're not testing those flows on localhost |

## The one-sentence version

**Start the Twilio A2P 10DLC filing today, even before you've finished the
rest of setup** — it's the only thing on this list with a multi-day clock
that you can't shorten by moving faster, and every Method Template depends
on SMS actually landing. Everything else in the 🟢 section can be done in
under an hour, in one sitting, whenever you're ready.
