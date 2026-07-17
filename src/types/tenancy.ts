export type AgencyRole = "owner" | "staff";
export type SubAccountRole = "admin" | "collaborator";
export type SubAccountStatus = "active" | "archived";

import type { Timestamp, FieldValue } from "firebase/firestore";
import type { SubscriptionStatus, MemberStatus } from "./firebase";

export interface AgencyDoc {
  id: string;
  name: string;
  ownerUid: string;
  createdAt: Date;
  updatedAt: Date;
  // Billing lives at agency scope.
  stripeCustomerId: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPriceId: string | null;
  /**
   * The Stripe Subscription object id (distinct from `subscriptionPriceId`,
   * which is just the base plan's price). Needed to add a subscription item
   * (an add-on) to an already-active subscription via the Subscription
   * Items API — see `lib/stripe/webhooks.ts` (stamped on checkout complete)
   * and `/api/sub-accounts/[id]/add-ons/purchase` (reads it to extend the
   * live subscription). Null until the agency's first paid checkout
   * completes.
   */
  subscriptionId?: string | null;
  /**
   * Optional URL of the agency's logo. When set, the dashboard sidebar +
   * browser tab title swap AgentStack's chevron mark + wordmark for the
   * agency's brand. The URL is rendered as <img src="…" />, so any public
   * https URL works (CDN, S3, the agency's own site). Null = AgentStack's
   * default mark.
   */
  logoUrl: string | null;
  /**
   * Public support / contact email for the agency. Surfaced on the custom
   * landing page ("Talk to us" CTAs, FAQ "email us" line, footer). Null
   * falls back to CUSTOM_BRAND.supportEmail from src/config/landing.ts.
   */
  supportEmail: string | null;
  /**
   * Agency's public domain — used in landing footer + canonical URL. No
   * scheme, no trailing slash (e.g. "leadmachine.com"). Null falls back to
   * CUSTOM_BRAND.primaryDomain.
   */
  primaryDomain: string | null;
  /**
   * Agency policy: may sub-accounts fall back to the SHARED (deployment-wide,
   * env-var) Twilio sender for SMS? Default ON — `undefined`/`true` means
   * allowed, so legacy agencies are unaffected. When explicitly `false`, the
   * shared fallback is refused and a sub-account must configure its own
   * dedicated Twilio number to send SMS. Enforced at the single send chokepoint
   * (`getTwilioForSubAccount`) and reflected in the workflow builder readiness.
   */
  sharedSmsAllowed?: boolean;
  /**
   * Per-step onboarding walkthrough video URLs, keyed by the step ids in
   * lib/onboarding/steps.ts (`contacts`, `sms`, `form`, `automation`,
   * `pipeline`, `ai`). The agency owner pastes these under Agency → Settings
   * → Onboarding videos; the new-agent checklist renders a "Watch" button
   * per step that has a URL. Absent / null = no videos configured yet.
   */
  onboardingVideos?: import("../lib/onboarding/steps").OnboardingVideos | null;
  /**
   * Solo Beta simplification gate. `undefined`/`false` (the default for
   * every new agency, including the one created at first signup) means the
   * agency is treated as a single-operator workspace: the Agency home,
   * sub-account switcher, and agency-level nav are hidden, and the owner is
   * routed straight into their one sub-account. Flips to `true`
   * automatically the moment a second sub-account is created (see
   * `POST /api/agency/sub-accounts`) — that's the "Team/Brokerage
   * intentionally introduced" moment the product spec calls for. Never
   * flips back to `false` automatically.
   */
  multiAccountModeEnabled?: boolean;
}

export interface SubAccountDoc {
  id: string;
  agencyId: string;
  /**
   * Sequential, human-readable identifier per agency. Assigned at creation
   * via a counter doc at agencies/{agencyId}/counters/subAccount, starting
   * at 1000 (so Main = 1000, next = 1001, ...). Doc IDs in URLs are still
   * Firestore auto-IDs; this number is a UI-only label.
   */
  accountNumber: number;
  name: string;
  slug: string;
  status: SubAccountStatus;
  timezone: string;
  createdByUid: string;
  createdAt: Date;
  updatedAt: Date;
  // Reserved for the upcoming Workflow Recipes feature. Populated null/empty in
  // v1; the per-sub-account credential UI lands when Workflows ships.
  twilioConfig: TwilioConfig | null;
  /**
   * Per-sub-account dedicated email sending domain (platform-managed model).
   * When `status === "verified"`, email sent on behalf of this sub-account
   * goes out from `emailFrom` on the tenant's own verified (sub)domain — all
   * through the agency's single shared Resend account/API key, varying only
   * the From address. Null (or any non-verified status) falls back to the
   * deployment-wide EMAIL_FROM shared sender, preserving v1 behavior.
   * Orthogonal to `replyToEmail`, which only sets the Reply-To header.
   */
  resendConfig: ResendConfig | null;
  /**
   * Agency-controlled gate for the dedicated email sending domain feature.
   * Only the agency owner can flip this (PATCH /api/agency/sub-accounts/[id]/
   * feature-gates). When `false`, sub-account admins CAN'T register or verify
   * a sending domain — the settings card shows a locked state, and the
   * POST/verify routes return 403. `tenantFrom()` also short-circuits on a
   * falsy gate, so sending falls back to the shared EMAIL_FROM even if a
   * verified resendConfig somehow persists. Defaults to `false` at creation
   * (explicit allowlist). May be undefined on docs created before the gate
   * shipped — read `=== true` so legacy docs stay locked.
   */
  emailDomainEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for the public API (slice 1-9 v1). Only the
   * agency owner can flip this (PATCH /api/agency/sub-accounts/[id]/
   * feature-gates). When `false` (or undefined on legacy docs): every
   * `/api/v1/*` request from this sub-account's keys returns 403
   * `api_access_disabled`, AND new keys / webhook subscriptions can't be
   * minted. Existing keys + subscriptions are PRESERVED — flipping the
   * gate back on resumes them instantly (vs the email gate which tears
   * down the verified Resend domain). Defaults to `false` at creation
   * (explicit allowlist). Read `=== true` so legacy docs stay locked.
   */
  apiAccessEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for bulk email broadcasts. When `false` (or
   * undefined on legacy docs): the broadcasts send route returns 403 and
   * the sidebar's Broadcasts entry renders as a disabled "Locked" item
   * the sub-account admin can't click. Defaults to `false` at creation
   * (explicit allowlist) so a tenant can't accidentally blast 25k emails
   * before the agency owner has signed off on the feature. Disabling does
   * NOT delete historical broadcast docs — re-enabling restores full
   * functionality immediately. Read `=== true` so legacy docs stay locked.
   */
  broadcastsEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for outbound AI voice calling (operator-
   * initiated click-to-call). When `false` (or undefined on legacy docs)
   * the /api/comms/voice/call route returns 403 and the Voice settings'
   * Outbound subsection renders a "Locked by your agency" state. Gated
   * separately from inbound voice because outbound consumes Vapi minutes
   * proactively and carries compliance weight. No tear-down on disable —
   * the linked assistant/number are shared with inbound. Defaults to
   * `false` at creation (explicit allowlist). Read `=== true`.
   */
  outboundVoiceEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for the WhatsApp channel (Twilio-delivered).
   * Only the agency owner can flip this (PATCH /api/agency/sub-accounts/[id]/
   * feature-gates). When `false` (or undefined on legacy docs): the WhatsApp
   * AI channel can't be enabled (channels route 403s), the inbound WhatsApp
   * webhook ignores messages for this sub-account, and the channel settings
   * card renders a "Locked by your agency" state. No tear-down on disable —
   * the sub-account's Twilio creds + sender number are preserved (shared with
   * SMS), so re-enabling resumes instantly. Defaults to `false` at creation
   * (explicit allowlist). Read `=== true` so legacy docs stay locked.
   */
  whatsappEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for the BETA Facebook Messenger + Instagram DM
   * unified-inbox channels (both ride one Meta connection, so they flip
   * together). Only the agency owner can flip this (PATCH
   * /api/agency/sub-accounts/[id]/feature-gates). When `false` (or undefined
   * on legacy docs — the default for every existing sub-account) the feature
   * is INERT and INVISIBLE: no Meta inbound webhook, send route, settings, or
   * channel badge surfaces anywhere. This gate is the master switch for a
   * feature that can't be fully self-tested without a connected Meta account,
   * so it ships off and an agency lights it up only for a sub-account that has
   * the Meta setup and volunteers to beta-test. No tear-down on disable —
   * nothing is provisioned until the consumer slices land. Read `=== true` so
   * legacy docs stay locked. See the "Facebook + Instagram inbox" plan.
   */
  metaInboxEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for the website builder (gitpage.site). Only the
   * agency owner can flip this (PATCH /api/agency/sub-accounts/[id]/
   * feature-gates). When `false` (or undefined on legacy docs): the website
   * build route 403s and the Website sidebar entry renders a "Locked by your
   * agency" state. No tear-down on disable — the existing website config +
   * published site are preserved, so re-enabling resumes instantly. Builds
   * consume the agency's shared gitpage build quota (30/hour), which is why
   * it's agency-controlled. Defaults to `false` at creation (explicit
   * allowlist). Read `=== true` so legacy docs stay locked.
   */
  websiteEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for **Website Studio** — the AI-guided, premium-
   * template agent website builder (plus its bundled setup assists: A2P
   * guidance, chat-widget help, SEO, etc.). Sold as a paid add-on, so only
   * the agency owner can flip it on for a sub-account that has paid (PATCH
   * /api/agency/sub-accounts/[id]/feature-gates). When `false` (or undefined
   * on legacy docs): the Website Studio sidebar entry renders a "Locked by
   * your agency" state and the /agent-site routes 403. No tear-down on
   * disable — the site doc + published page are preserved, so re-enabling
   * resumes instantly. Defaults to `false` at creation; read `=== true`.
   */
  websiteStudioEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for the Social Planner (schedule + auto-publish
   * posts to the connected Facebook Page / Instagram Business via the shared
   * `metaConfig` connection). Only the agency owner can flip it (PATCH
   * /api/agency/sub-accounts/[id]/feature-gates). When `false` (or undefined
   * on legacy docs): the Social Planner sidebar entry renders a "Locked by
   * your agency" state, the connect/create/publish routes 403, and the whole
   * surface stays invisible. No tear-down on disable — scheduled posts +
   * the Meta connection are preserved, so re-enabling resumes instantly.
   * Defaults to `false` at creation (explicit allowlist). Read `=== true` so
   * legacy docs stay locked. Posting reuses the same Meta App Review-gated
   * connection as the inbox, plus the extra publish scopes requested at
   * connect time. See the "Social Planner v1" plan.
   */
  socialPlannerEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for the Community + Courses feature (Skool-style
   * groups: feed + classroom + gamification, with magic-link members served at
   * the public `/c/[saId]/...` surface). Only the agency owner can flip it
   * (PATCH /api/agency/sub-accounts/[id]/feature-gates). When `false` (or
   * undefined on legacy docs): the Community sidebar entry renders a "Locked by
   * your agency" state AND every `/c/*` page + community API 404s/403s so a
   * disabled sub-account's groups are unreachable by direct URL. No tear-down on
   * disable — members, posts, and courses are preserved, so re-enabling resumes
   * instantly. Defaults to `false` at creation (explicit allowlist). Read
   * `=== true` so legacy docs stay locked. See "Community + Courses v1".
   */
  communityEnabledByAgency?: boolean;
  /**
   * Agency-controlled gate for the IDX Listings feature — a realtor's own
   * IDX Broker account synced into a branded public listings search + detail
   * page, with lead capture wired into Contacts. Only the agency owner can
   * flip it (PATCH /api/agency/sub-accounts/[id]/feature-gates). When `false`
   * (or undefined on legacy docs): the IDX Listings sidebar entry renders a
   * "Locked by your agency" state, the Settings credential section is locked,
   * and the sync job / public pages / inquire route all 403. No tear-down on
   * disable — `idxConfig` + synced `idxListings` are preserved, so re-enabling
   * resumes instantly. Defaults to `false` at creation. Read `=== true` so
   * legacy docs stay locked. See "IDX Listings (IDX Broker) v1".
   */
  idxEnabledByAgency?: boolean;
  /**
   * Per-feature "hide instead of lock" overrides for the sidebar-gated features
   * (Broadcasts, Website, Social Planner, Community, IDX Listings). They ONLY
   * take effect when the matching `*EnabledByAgency` gate is off. Default
   * behavior (field undefined / `false`) is the legacy one: a disabled feature
   * renders a greyed-out "Locked" sidebar entry so the tenant can see it exists
   * (an upsell hook). When set `true`, a disabled feature's sidebar entry is
   * omitted entirely so the sub-account never knows the feature exists — some
   * agency owners prefer this. No effect while the feature is enabled. Only the
   * agency owner can flip these (same PATCH route as the gates). Read `=== true`
   * so legacy docs keep the visible-Locked behavior.
   */
  broadcastsHiddenWhenDisabled?: boolean;
  websiteHiddenWhenDisabled?: boolean;
  socialPlannerHiddenWhenDisabled?: boolean;
  communityHiddenWhenDisabled?: boolean;
  idxHiddenWhenDisabled?: boolean;
  /**
   * BETA Facebook Messenger + Instagram DM connection. Null/undefined until the
   * sub-account admin connects a Page (only possible when
   * `metaInboxEnabledByAgency` is on). See {@link MetaConfig}.
   */
  metaConfig?: MetaConfig | null;
  bookingConfig: BookingConfig | null;
  sendWindow: SendWindow | null;
  /**
   * Generic booking-page URL surfaced via the {{bookingLink}} merge tag in
   * email + SMS templates. Calendly is the canonical case but any URL works
   * (Cal.com, TidyCal, SavvyCal, Stripe Payment Link, etc.). Null when the
   * sub-account hasn't set one — {{bookingLink}} resolves to empty string.
   */
  bookingLink: string | null;
  /**
   * Single source of truth for the Reply-To header on every email AgentStack
   * sends on behalf of this sub-account — automation lead-step emails AND
   * manual contact-profile sends. Null falls back to no Reply-To (current
   * default behavior). One address per sub-account by design — keeps
   * replies from one client landing consistently in one inbox regardless
   * of which teammate triggered the send.
   */
  replyToEmail: string | null;
  /**
   * Sub-account-level kill switch for the automation engine. When true:
   *   - fireTriggers() returns early without creating any execution docs
   *   - in-flight executions short-circuit at their next step with
   *     skippedReason: "automation_disabled"
   * Reset to false to resume firing. Defaults to false on creation; the
   * "Pause all automations" toggle on the Automations page drives it.
   */
  automationsPaused: boolean;
  /**
   * Primary point of contact at the client this sub-account belongs to —
   * the person the agency speaks to about this workspace. All fields
   * optional. Sub-accounts used for internal teams (not external clients)
   * can leave this null entirely. Surfaced on the sub-account dashboard
   * as a slim header strip and edited from Settings.
   */
  accountContact: AccountContact | null;
  /**
   * Per-sub-account PayPal connection used for the Products + Invoices
   * payment flow. v1 uses paypal.me links — sub-account owner pastes
   * their PayPal.me username; on invoice send we generate
   * `https://paypal.me/{username}/{amount}{currency}`. Null = not
   * connected. v2 will add Stripe Connect alongside.
   */
  paypalConfig: PayPalConfig | null;
  /**
   * Google review-request config (SMS / WhatsApp "leave us a review" sends
   * after payment or on demand). Optional — legacy/undefined reads as off.
   */
  googleReviewConfig?: GoogleReviewConfig | null;
  /**
   * Public https URL of this sub-account's brand logo. Renders on
   * quote/invoice emails, public /q/[token] pages, and PDFs — the
   * external surfaces this client's customers see. Distinct from
   * agency.logoUrl (which is internal CRM chrome). Null = no logo, the
   * sub-account name shows alone.
   */
  logoUrl: string | null;
  /**
   * Opt-in territory scoping. When true, collaborators only see deals
   * and contacts whose `territoryId` is in their `assignedTerritoryIds`.
   * Admins and the agency owner are unaffected. When false (the
   * default), territory data is preserved but ignored — the UI hides
   * every territory chip / column / picker, and rules short-circuit to
   * the existing per-sub-account access check. Strictly additive.
   * May be undefined on docs created before the feature shipped — read
   * `=== true` so the missing-field path stays off.
   */
  territoryScopingEnabled?: boolean;
  territoryScopingEnabledAt?: Date | null;
  territoryScopingEnabledByUid?: string | null;
  /**
   * Optional per-sub-account overrides for the deal pipeline's stage labels +
   * order. ONLY label/order are editable; ids + won/lost terminals always come
   * from the canonical {@link PipelineStage} set, so this is a pure display
   * layer. Absent/undefined (the default for every existing sub-account) →
   * the canonical stages render unchanged. Set via PATCH
   * /api/sub-accounts/[id]/pipeline-stages (admin). See "Phase 2 (2A)".
   */
  pipelineStages?: import("./deals").PipelineStageOverride[];
  /**
   * Setup-checklist progress for this sub-account. Holds the ids of the
   * onboarding steps (see lib/onboarding/steps.ts) the operator has marked
   * done. Persisted so the checklist survives reloads and the dashboard can
   * force a new customer onto the /get-started checklist at login until every
   * step is complete. Absent/empty on a fresh sub-account.
   */
  onboardingStepsCompleted?: string[];
  /**
   * The custom domain the sub-account wants to front their published website
   * (e.g. "janedoe-homes.com"). Bare host, no scheme. Saved during the domain
   * setup step; the actual DNS + Vercel domain hookup is an ops step the
   * Connect Domain guide walks the operator through. Null = using the default
   * deployment URL.
   */
  customDomain?: string | null;
  /**
   * GHL migration connection (Phase 4). Holds the Private Integration Token +
   * location id used to pull the account's data. The token is a secret stored
   * like `twilioConfig.authToken` — server-only, never returned to the client.
   * Null until connected; cleared on disconnect.
   */
  ghlImportConfig?: GhlImportConfig | null;
  /**
   * IDX Broker connection for the realtor's own MLS listings. Holds the
   * Platinum API access key (server-only, stored like `twilioConfig.authToken`)
   * + the approved MLS id it searches. Null until connected; preserved (not
   * torn down) when the agency `idxEnabledByAgency` gate is disabled. See
   * "IDX Listings (IDX Broker) v1".
   */
  idxConfig?: IdxConfig | null;
}

export interface GhlImportConfig {
  /** GHL Private Integration Token (pit-...). Server-only — never sent to the browser. */
  token: string;
  /** The GHL sub-account (location) id this token is scoped to. */
  locationId: string;
  connectedByUid: string | null;
  connectedAt: Timestamp | FieldValue | null;
  lastValidatedAt: Timestamp | FieldValue | null;
}

export interface IdxConfig {
  enabled: boolean;
  /** IDX Broker Platinum API access key. Server-only — never sent to the browser. */
  accessKey: string;
  /** Which of the account's approved MLSs to search. Null until the operator picks one. */
  mlsId: string | null;
  /** "Listings provided by <MLS name>" attribution line shown on public pages. */
  displayName: string | null;
  lastSyncAt: Timestamp | FieldValue | null;
  lastSyncStatus: "idle" | "syncing" | "success" | "failed";
  lastSyncError: string | null;
  listingCount: number;
}

export interface AccountContact {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface TwilioConfig {
  /**
   * Master toggle for the dedicated-SMS feature on this sub-account. When
   * true, outbound + inbound SMS use the credentials below and the contact
   * profile renders the Messages tab + chat thread. When false (or this
   * whole config is null), the deployment falls back to the env-var
   * Twilio (existing shared-sender behavior). Strictly additive — flipping
   * this off restores the prior experience.
   */
  enabled: boolean;
  accountSid: string;
  authToken: string;
  /** E.164 (e.g. "+15551234567"). The number this sub-account sends from. */
  fromNumber: string;
  /**
   * E.164 WhatsApp sender number for this sub-account (the number registered
   * to their Twilio WhatsApp sender / WABA), WITHOUT the `whatsapp:` prefix —
   * the Twilio wrapper adds it at send time. WhatsApp reuses the SMS creds
   * (`accountSid` + `authToken`) above; only the sending number differs.
   * Null/empty = WhatsApp not configured for this sub-account. In sandbox
   * mode this is Twilio's shared sandbox number.
   */
  whatsappFromNumber?: string | null;
  /**
   * True when `whatsappFromNumber` points at Twilio's shared WhatsApp
   * Sandbox (for testing before the WABA sender is approved) rather than a
   * production sender. Surfaced in the UI so operators know inbound only
   * works for numbers that have joined the sandbox via the join code.
   */
  whatsappSandbox?: boolean;
  /**
   * True once we've set the inbound webhook for the WhatsApp sender to point
   * at /api/webhooks/twilio/whatsapp/inbound. False/undefined if auto-config
   * failed or wasn't attempted (operator configures manually in Twilio).
   */
  whatsappInboundWebhookConfigured?: boolean;
  /**
   * True once we've called Twilio's IncomingPhoneNumbers API and set the
   * inbound smsUrl for `fromNumber` to point at our /api/webhooks/twilio/inbound
   * endpoint. False if auto-config failed (operator must configure manually).
   */
  inboundWebhookConfigured: boolean;
  /** Last time we successfully called Twilio's /Accounts/{sid} with the saved creds. */
  lastValidatedAt: Date | null;
  /**
   * Reserved for future use — a per-sub-account secret used to extra-verify
   * inbound webhooks beyond Twilio's signature. Null in v1; we rely on
   * Twilio's standard signature verification with `authToken`.
   */
  inboundWebhookSecret: string | null;
}

/**
 * BETA Meta (Facebook Messenger + Instagram DM) connection for one sub-account.
 * Null/undefined = not connected. Populated by the OAuth callback
 * (/api/sub-accounts/[id]/meta/callback) after the sub-account admin connects a
 * Facebook Page; both Messenger and IG DM ride this single connection. Gated by
 * the agency `metaInboxEnabledByAgency` flag — nothing here is read or written
 * unless that gate is on. Strictly additive; absent on every existing doc.
 */
export interface MetaConfig {
  /** True once a Page has been connected + the webhook subscription attempted. */
  connected: boolean;
  /** Facebook Page id — the inbound webhook routes Messenger events by this. */
  pageId: string;
  /** Page display name, shown in the settings card. */
  pageName: string;
  /**
   * Long-lived Page access token used to send/receive on Messenger + IG DM and
   * to (un)subscribe the page to our webhook. Stored in Firestore like
   * `TwilioConfig.authToken`; never displayed back to the operator.
   */
  pageAccessToken: string;
  /** Linked Instagram business account id — inbound IG events route by this. Null if the Page has no IG account. */
  instagramBusinessAccountId: string | null;
  /** Linked IG @handle, shown in the settings card. Null when no IG account. */
  instagramUsername: string | null;
  /**
   * What the currently-stored Page token can actually do, derived from the
   * permissions Meta GRANTED at connect time (via /me/permissions) intersected
   * with the agency gates that were on. This is the single source of truth that
   * keeps the inbox and Social Planner from disagreeing about one shared
   * connection:
   *   - `inbox`   — true when the inbox gate is on AND `pages_messaging` was
   *                 granted (Messenger/IG DM send+receive).
   *   - `publish` — true when the Social gate is on AND `pages_manage_posts`
   *                 was granted (Social Planner posting).
   * Optional so legacy connections (made before capability tracking) read as
   * undefined; helpers treat missing `inbox` as true (back-compat — the inbox
   * worked) and missing `publish` as false (must reconnect via the unified
   * card to gain posting). Reconnecting always refreshes this.
   */
  capabilities?: { inbox: boolean; publish: boolean };
  connectedByUid: string | null;
  connectedAt: Timestamp | FieldValue | null;
}

export interface PayPalConfig {
  /**
   * PayPal.me username — the path segment after paypal.me/. 1-20 chars,
   * alphanumeric + hyphens. The operator finds this on
   * https://paypal.com/paypalme. Stored as the bare username (no
   * leading slash, no `paypal.me/` prefix).
   */
  username: string;
  connectedAt: Date;
}

/**
 * Per-sub-account Google review-request configuration. The dispatcher
 * (`lib/reviews/request.ts`) sends a "leave us a review" message after a
 * quote/invoice is marked paid (when `triggerOnQuotePaid`) or on demand via the
 * contact-profile button.
 */
export interface GoogleReviewConfig {
  /** Gates the AUTO trigger. The manual button works whenever `reviewUrl` is set. */
  enabled: boolean;
  /** Google review link, e.g. https://g.page/r/<id>/review. */
  reviewUrl: string;
  /**
   * "sms" | "whatsapp_template" (approved template) | "whatsapp_manual"
   * (free-form WhatsApp, in-window only). Legacy docs may store "whatsapp" —
   * normalize via `normalizeReviewChannel`.
   */
  channel: "sms" | "whatsapp_template" | "whatsapp_manual";
  /** Free-form body (SMS + whatsapp_manual). Tags: {{firstName}} / {{businessName}} / {{reviewUrl}}. */
  messageTemplate: string;
  /** Id of an APPROVED whatsappTemplates doc — only for `whatsapp_template`. */
  whatsappTemplateId: string | null;
  /** Skip an AUTO re-ask if the contact was asked within this many days. */
  cooldownDays: number;
  triggerOnQuotePaid: boolean;
  /**
   * Auto-send when a Won deal is ticked "Completed" on the pipeline card.
   * Like `triggerOnQuotePaid`, only meaningful for SMS / WhatsApp Template
   * (WhatsApp Manual can't auto-send). Undefined on legacy docs → off.
   */
  triggerOnDealCompleted?: boolean;
  updatedAt: Date;
}

export interface ResendConfig {
  /** Resend Domains-API UUID for this sub-account's dedicated sending domain. */
  domainId: string;
  /** The verified (sub)domain emails send from, e.g. "mail.acmeplumbing.com". */
  domainName: string;
  /** Full From header built on `domainName`, e.g. "Acme Plumbing <hello@mail.acmeplumbing.com>". */
  emailFrom: string;
  /**
   * Verification state from Resend. Only "verified" gates live sending; any
   * other value (or a null `resendConfig`) falls back to the shared EMAIL_FROM.
   */
  status: "pending" | "verified" | "failed";
  /** Last time we successfully polled Resend and confirmed the domain status. */
  lastValidatedAt: Date | null;
}

export interface BookingConfig {
  defaultPageSlug: string;
  types: Array<{ slug: string; label: string; durationMinutes: number }>;
}

export interface SendWindow {
  startHour: number;
  endHour: number;
  timezone: string;
}

export interface AgencyMemberDoc {
  uid: string;
  agencyId: string;
  role: AgencyRole;
  status: MemberStatus;
  email: string;
  displayName: string;
  addedAt: Date;
  addedByUid: string;
}

export interface SubAccountMemberDoc {
  uid: string;
  subAccountId: string;
  agencyId: string;
  role: SubAccountRole;
  status: MemberStatus;
  email: string;
  displayName: string;
  addedAt: Date;
  addedByUid: string;
  /**
   * Territory ids this member can see deals/contacts for. Empty array
   * (or undefined on legacy rows) = no territory access. Ignored when
   * the member is admin OR the sub-account's `territoryScopingEnabled`
   * is not true.
   */
  assignedTerritoryIds?: string[];
}

export type TerritoryStatus = "active" | "archived";

/**
 * Reserved id for the auto-seeded "Global" territory every sub-account
 * gets when territory scoping is first enabled. Contacts and members
 * default to Global, so flipping scoping on doesn't blank anyone's
 * pipeline — admins then carve out real territories and move reps off
 * Global. Fixed id (not an auto-id) so every default path can reference
 * it without a lookup. Per-sub-account (lives at
 * subAccounts/{saId}/territories/global).
 */
export const GLOBAL_TERRITORY_ID = "global";

/**
 * Sub-account-scoped territory / region / state used by the opt-in
 * territory-scoping feature. Lives at
 *   subAccounts/{saId}/territories/{territoryId}
 * Admin-managed via /api/sub-accounts/[id]/territories/*.
 */
export interface TerritoryDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  /** Display name, 1–60 chars, unique per sub-account (case-insensitive). */
  name: string;
  /** Optional short code, 1–12 chars (e.g. "CA", "DACH"). */
  code: string | null;
  status: TerritoryStatus;
  createdByUid: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InviteDocV2 {
  id: string;
  email: string;
  agencyId: string;
  subAccountId: string | null;
  subAccountRole: SubAccountRole | null;
  agencyRole: AgencyRole | null;
  invitedByUid: string;
  createdAt: Date;
  acceptedByUid: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  /**
   * Territories to pre-assign when this collaborator accepts. Applied to
   * their `subAccountMembers/{uid}.assignedTerritoryIds` at signup. Empty
   * / absent → the new member defaults to Global. Only meaningful for
   * `subAccountRole === "collaborator"` while territory scoping is on;
   * ignored for admin invites (admins always see every territory).
   */
  assignedTerritoryIds?: string[];
}

export interface UserSubAccountMembership {
  subAccountId: string;
  agencyId: string;
  role: SubAccountRole;
  name: string;
  /**
   * Mirror of SubAccountDoc.accountNumber. May be undefined for sub-accounts
   * created before the numbering migration; UI should fall back gracefully.
   */
  accountNumber?: number;
  addedAt: Date;
}

export interface UserAgencyMembership {
  agencyId: string;
  role: AgencyRole;
  name: string;
}

export interface TenantScope {
  agencyId: string;
  subAccountId: string;
}
