# AgentStack CRM audit edits — 2026-11-23

The seven supplied edit prompts are implemented in the local checkout. The active `custom` landing variant retains its design, demonstration data, and Method section. The public Solo card is shared by `/` and `/pricing`.

## Owner-provided values still needed

- Solo monthly pricing is now confirmed at **$99/month**. `src/lib/public-site/offer.ts` supplies the public cards, monthly enrollment label, new-checkout amount, and homepage offer schema. Existing subscriptions are not repriced by this code change. Annual billing retains its existing $1,188/year setup.
- The unfinished discounts/trial/guarantee line has been removed from the shared Solo card until public terms are confirmed. Unsupported no-fee claims were omitted. The cancellation text is shared with the help articles; no retention duration was invented.
- `/pricing` is explicitly public in auth middleware. Regression tests cover logged-out and auth-error access while keeping dashboard routes and similar path names protected. Deployment verification uses fresh HTTP requests with no cookies.
- Configure `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, and server-only `GA4_API_SECRET`. Rebuild after changing public variables. Do not configure the same GA4 stream a second time through GTM.
- Enable `invoice.paid` alongside the existing checkout and subscription webhook events in the Stripe endpoint configuration.
- Check guide passages labeled `[VERIFY IN APP]` against the enabled preview features in a real workspace.

## Event ownership

Browser forms emit `signup_started` on their first pointer/focus interaction, with one action ID for that mounted form. The PostHog CDN SDK queues early events. GA4 uses its standard gtag queue. Autocapture and session recording are disabled.

Successful server actions emit the remaining funnel events. Email, OAuth, and purchase-claim signup paths are covered; repeat sign-in does not emit a signup completion. Workspace provisioning is tracked after the write. Setup completion uses the six existing wizard groups and `step` values 1–6; repeated saves deduplicate per workspace and step. Skipping screens does not imply completion. Live contact creation and form/booking submissions cover first capture. Scheduled bookings and manual appointments linked to a contact cover first appointment; payment holds count only after being marked paid. Seed/sample creation is excluded.

`subscription_activated` comes only from a signed, positive-value `invoice.paid` event tied to a subscription. Renewals share the subscription action key and do not emit another activation. `subscription_cancelled` comes from Stripe-confirmed scheduled cancellation or subscription deletion; the same subscription is counted once.

Server events have a durable Firestore claim for each provider, event, and action. Concurrent requests and Stripe retries therefore send at most once. A provider/network failure is recorded as `failed` or `uncertain` in the server-only `analyticsEvents` collection. Uncertain requests are not automatically resent because GA4 cannot guarantee deduplication. Inspect these records when diagnosing missing events. This favors duplicate prevention over guaranteed delivery; do not treat a successful HTTP response from GA4 as proof of report ingestion.

Signup/workspace-created events identify the account; workspace milestones identify the workspace; billing events identify the Stripe customer. Use `workspace_id` and existing tenancy/customer records when joining account-level reporting. No contact names, emails, message bodies, or payment details are sent in these custom events.

## Verification and remaining external work

Automated checks validate valid JSON-LD with the confirmed $99/month offer and no invented profiles, 15 help article bodies without H1s, five guides in the required word range, and duplicate event prevention. Compare-page JSON-LD is unchanged.

Live provider ingestion needs configured credentials and a controlled signup/payment test. No deployment, directory submission, G2/Capterra claim, or fabricated beta testimonial was performed. Those external follow-ups remain with Franco.

Implementation references: [PostHog browser SDK](https://posthog.com/docs/libraries/js), [PostHog capture API](https://posthog.com/docs/api), and [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events).

## Completed verification

- Full Vitest suite: **107 files, 1,059 tests passed**.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- ESLint: all changed TypeScript/TSX files passed with no warnings. The existing pnpm layout requires resolving the installed plugins via the Next ESLint config's dependency directory (`NODE_PATH`); no dependency or lockfile changes were made.
- Production build: `node node_modules/next/dist/bin/next build` passed, including all 147 static pages. The repository skips lint/types inside Next builds, so both were checked separately above.
- `git diff --check` passed.
- Chrome local preview: homepage layout, navigation to `/pricing`, expanded contact import article with one H1, and the six-section `/playbook` were reviewed. No account creation or live payment was performed during preview.
