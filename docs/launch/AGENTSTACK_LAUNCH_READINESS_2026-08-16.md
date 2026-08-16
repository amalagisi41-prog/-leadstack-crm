# AgentStack launch readiness — August 16, 2026

## Scope

This evaluation is for AgentStack only. Customer-specific brands, domains,
content, and migration fixtures are not product defaults.

## AgentStack entity launch-health score

**78/100 — conditional launch readiness.** This is the product/entity score for
August 16, 2026. It is separate from the customer-facing Site Health percentage
described below.

| Area                       |      Score | Evidence and remaining risk                                                                                                                         |
| -------------------------- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product and engineering QA |      30/30 | 691 tests, strict lint, production build, and responsive preview pass                                                                               |
| UX and brand readiness     |      20/20 | Neutral realtor starter, direct onboarding path, responsive controls, and completed light/dark brand asset system                                   |
| Legal and compliance       |      10/20 | Product-specific policies are published; counsel, legal entity, address, governing law, and venue still require confirmation                        |
| Production infrastructure  |      10/20 | Domain and HTTPS gates are implemented; production Firebase Admin and managed nameserver configuration still require an authenticated staging proof |
| Release operations         |       8/10 | Launch report and fail-closed gates exist; webhook, restore, alerting, and full clean-account journey still require production-like validation      |
| **Total**                  | **78/100** | **Suitable for controlled internal/staging use; not yet cleared for an unsupervised paying-customer launch**                                        |

## Blank-slate Site Health baseline

Site Health has eight equal launch checks. A new account starts at **0%**. The
domain task records that a hostname has been saved; the separate website task
does not complete until an AgentStack or external website is verified live.

| Milestone                                  | Score |
| ------------------------------------------ | ----: |
| New account, no setup                      |    0% |
| Business Blueprint and compliance complete |   25% |
| Website published                          |   38% |
| Domain saved and website verified live     |   50% |
| Lead form created                          |   63% |
| Booking page created                       |   75% |
| Website chat enabled                       |   88% |
| Business email verified                    |  100% |

The automated clean-room test is
`src/lib/site-health/blank-slate-launch.test.ts`.

## Completed in this pass

- Updated the real `/privacy` and `/terms` pages with AgentStack-specific SaaS,
  real-estate, AI, website-import, communications, and data terms.
- Removed customer-specific Website Studio starter content and replaced it
  with a neutral real-estate agent starter.
- Changed the default onboarding path to a new business that needs a domain
  and managed hosting.
- Combined domain save and managed-host preparation into one direct action.
- Kept the website/publish check tied to live verification while allowing a
  saved hostname to complete the separate domain-setup task.
- Removed hard-coded production nameservers. DNS cutover now fails closed when
  deployment nameservers are not configured.
- Corrected the Website Studio mobile phone action to meet the 44px touch-target
  minimum.
- Completed the AgentStack mark system: cream primary tile for light and
  reduced-size use, original-color navy alternate for dark applications, one
  consistent crooked-smile bot character, matching chevron placement and
  thickness, app/PWA/social/marketplace derivatives, asset manifest, production
  icon pack, logo sheet, and brand guidelines.
- Verified desktop (1440×900) and mobile (390×844) hosted preview rendering:
  no horizontal overflow, clipped elements, broken images, or undersized mobile
  controls after the fix.
- Verified `/privacy` and `/terms` render without bracketed placeholders or
  horizontal overflow.
- Added typed AI failure handling, account diagnostics, usage metering, bounded
  requests, and JSON-safe responses across Zack and Blueprint AI workflows.

## Verification evidence

- Vitest: 64 files, 691 tests passed after rebasing over the latest remote launch fixes.
- ESLint: 0 errors; 30 existing unused-code warnings.
- Next.js production build: passed, 136 static pages generated.
- Playwright browser evaluation: neutral hosted preview plus legal pages at
  desktop and mobile sizes.

## Launch completion priorities

### P0 — required before onboarding the first paying customer

1. Have counsel approve the published Privacy Policy and Terms, and identify
   AgentStack's contracting legal entity, business address, governing law, and
   venue in the checkout/order agreement.
2. Configure and validate production Firebase Admin credentials. Local startup
   currently reports that `FIREBASE_ADMIN_PROJECT_ID` is absent, so authenticated
   end-to-end onboarding cannot be certified in this local environment.
3. Set `NEXT_PUBLIC_TARGET_NAMESERVERS` to AgentStack's actual managed DNS pair
   and test a disposable domain from registration through HTTPS issuance. The UI
   now blocks DNS instructions when this value is absent.
4. Run one staging smoke journey with a truly new user: signup, workspace
   creation, Blueprint, compliance, domain, hosting, Website Studio publish,
   HTTPS verification, form submission, booking, chat capture, and email send.
5. Verify production Stripe, email, SMS/A2P, and hosting webhooks with sandbox or
   controlled test transactions; confirm retries, idempotency, and audit logs.
6. Confirm the production `OPENROUTER_API_KEY` belongs to the funded OpenRouter
   workspace and exercise the authenticated AI health check after each key or
   model change.

### P1 — complete before broad public launch

1. Install from the updated lockfile in a clean CI checkout and confirm the
   declared PostCSS dependency removes the Turbopack external-package warning.
2. Resolve the 30 lint warnings and turn the launch pipeline into a zero-warning
   gate.
3. Add authenticated Playwright fixtures for the complete blank-slate journey
   and run them on desktop plus a 390px mobile viewport in CI.
4. Add automated accessibility checks, broken-link crawling, form-delivery
   assertions, and visual-diff thresholds for all public templates.
5. Establish restore drills, alert routing, incident ownership, retention, and
   customer-data export/deletion verification.

### P2 — scale and polish

1. Reduce the 327 kB shared first-load JavaScript and the 441 kB Website Studio
   route with bundle analysis and lazy loading.
2. Add per-step onboarding analytics for time-to-first-publish and failure rate.
3. Expand realtor presets only through a provenance-reviewed, brand-neutral
   component registry.
