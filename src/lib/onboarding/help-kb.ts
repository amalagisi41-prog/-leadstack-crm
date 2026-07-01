/**
 * Onboarding help knowledge base.
 *
 * Operator-facing (the agent/realtor setting up their CRM) — NOT the
 * lead-facing AI persona that answers home buyers. This content is fed to the
 * onboarding help assistant (`/api/onboarding/help`) as grounding so it can
 * answer "how do I…" setup questions accurately instead of hallucinating.
 *
 * Keep it lean — it's sent on every request. Derived from the real product
 * surfaces + the CLAUDE.md onboarding guide. When a feature moves, update the
 * matching section here so the assistant stays truthful.
 */

export const ONBOARDING_HELP_KB = `# Setting up your CRM — help topics

## Importing contacts
- Go to Contacts in the sidebar. Click "Upload CSV" to import your existing database from another CRM, or "Add contact" to enter one manually.
- The CSV importer maps columns automatically (name, email, phone, tags, source) and lets you fix any mismatches before importing.
- A downloadable CSV template is available on the Contacts empty state if you want the exact column headers.
- CSV-imported and manually-created contacts won't appear on the dashboard Leads map (only form-submitted contacts capture location).

## Connecting your phone number (SMS)
- Go to dashboard Settings → SMS. Turn on the dedicated-Twilio toggle and paste your Twilio Account SID, Auth Token, and From Number (in +15551234567 format).
- On save, the app auto-configures the inbound webhook on your Twilio number. If that fails (permissions), the settings page shows the webhook URL with a copy button so you can set it manually in the Twilio console under the number's "A MESSAGE COMES IN" setting.
- Once connected: you can send/receive SMS from a contact's profile, the contact gets a Messages tab, and the AI agent can auto-reply to inbound texts.
- Twilio trial accounts can only text phone numbers you've verified in Twilio, and prepend a trial banner. Upgrade for real use.

## Building a lead capture form
- Go to Forms → create a form. Drag to reorder fields; pick from the field types; use "mapsTo" to map a field onto a standard contact field (name/email/phone).
- Every form has a public hosted page at /f/[id] and an iframe embed snippet.
- On submit, the form auto-creates a contact (and optionally a deal) and can trigger your Speed-to-Lead automation.

## Turning on Speed-to-Lead automation
- Open a form → the Automation panel → attach the "Speed-to-Lead" recipe. It can send an SMS to the lead, an email to the lead, and an owner notification.
- Every email template must include the {{unsubscribeLink}} tag (required for CAN-SPAM). The template editor enforces this.
- Automations need QStash configured on the deployment. If a form submits but no SMS/email arrives, QStash isn't set up or NEXT_PUBLIC_APP_URL doesn't match your public URL.
- Supported merge tags: {{contact.firstName}}, {{contact.lastName}}, {{contact.email}}, {{contact.phone}}, {{owner.firstName}}, {{owner.email}}, {{workspace.name}}, {{bookingLink}}, {{unsubscribeLink}}. Other tags resolve to empty.

## Your pipeline
- The Pipeline (Kanban) board is pre-set for real estate: New Lead → Contacted → Showing Scheduled → Offer Made → Closed (plus Lost). Drag deal cards between stages.
- You can rename/reorder stages from dashboard settings. Terminal Won/Lost behavior is fixed.

## Activating your AI agent
- Go to AI Agents → Overview. Your persona is pre-written for a CT realtor. Fill in your business name and save the profile.
- Optional: paste your website URL and click "Refresh KB" so the bot can answer factual questions about your services (requires Firecrawl configured).
- Then enable the agent per channel: Web Chat (embeddable widget), SMS (auto-replies on your Twilio number), and optionally WhatsApp / Voice.
- If a channel toggle says "Set the persona first", your profile's system prompt is empty — save the Overview first.
- The AI won't reply if the persona is empty, outside business hours, or if OPENROUTER_API_KEY isn't set on the deployment.

## Sending email
- From a contact profile, click Email. Sends from the shared sender with your email on Reply-To, so replies come to your inbox.
- Requires RESEND_API_KEY + EMAIL_FROM configured. If the Email button send fails, Resend isn't configured or the from-domain isn't verified.

## Booking pages
- Configure a booking page (durations, hours, optional price) and share the public link /b/[saId]/[slug]. Recipients pick a slot and get an ICS confirmation email.

## Quotes
- Build a line-itemed quote from the Quotes tab or a contact profile, send it via branded email, and the recipient accepts/declines on a public page. Accepting can auto-create a Won-stage deal.

## Common issues
- "Comms buttons disabled" on a contact: the contact has no email or no phone — edit the contact and add the field.
- Cmd/Ctrl+K opens global search (only on dashboard pages, not the public landing).
- If the AI Web Chat widget doesn't appear on a client's site, add that site's hostname under AI Agents → Web Chat → Allowed domains.`;
