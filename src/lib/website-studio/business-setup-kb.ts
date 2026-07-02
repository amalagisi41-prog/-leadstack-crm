/**
 * Business Setup assistant knowledge base.
 *
 * Operator-facing help for the "essential business setup" tasks bundled under
 * Website Studio: A2P 10DLC registration, embedding the chat widget, local
 * SEO, and Google Business Profile. Fed to /api/sub-accounts/[id]/business-
 * setup as grounding so the assistant answers accurately instead of guessing.
 *
 * Keep it lean (sent every request) and truthful to how the product works.
 */

export const BUSINESS_SETUP_KB = `# Essential business setup — help topics

## A2P 10DLC (US SMS registration)
A2P 10DLC is the US carrier registration required to send business SMS from a
standard 10-digit local number reliably. Without it, texts get filtered or
blocked and you'll see high failure rates.
- You register through Twilio (the SMS provider this CRM uses). Steps in the
  Twilio Console: (1) create a Brand (your business identity — legal name, EIN,
  address, website), (2) create a Campaign (use case: "Customer Care" or
  "Mixed" for lead follow-up), (3) attach your phone number to the campaign.
- Have ready: business legal name, EIN/Tax ID, business address, a support
  email, your website URL, and sample messages (your Speed-to-Lead SMS is a
  good sample). Include opt-in language and "Reply STOP to opt out".
- Approval usually takes a few days. Sole proprietors can register too (a
  lighter "sole prop" campaign) but have lower daily throughput.
- Your dedicated Twilio number is configured in this CRM under Settings → SMS.
  A2P is done in Twilio, not here — but you need it before you send at volume.

## Chat widget (Web Chat)
The AI chat widget goes on your website so visitors can chat 24/7 and get
captured as leads.
- Configure it in AI Agents → Web Chat: toggle it on, set Allowed domains to
  your site's hostname(s) (e.g. yoursite.com), then copy the one-line snippet.
- The snippet looks like: <script src="https://YOUR-CRM-DOMAIN/widget.js"
  data-sa="YOUR-SUBACCOUNT-ID" async></script> — paste it before the closing
  </body> tag on your site.
- If the bubble doesn't appear on your site, the page's hostname isn't in
  Allowed domains — add it and reload.
- The widget uses your shared AI persona (set on AI Agents → Overview), so fill
  the persona in first or it won't reply.

## SEO basics (get found on Google)
- Each page needs a clear title + meta description with your market + specialty
  (e.g. "Fairfield County CT Real Estate | Jane Doe"). Website Studio sets a
  sensible title/description from your profile automatically.
- Local SEO matters most for agents: consistent Name/Address/Phone (NAP) across
  your website, Google Business Profile, and directories.
- Publish useful local content (neighborhood guides, market updates) — the
  Website Studio listings + about sections help.
- Get reviews: this CRM can send Google review requests from a contact (set your
  Google Business "place ID" in the sub-account settings). More reviews lift
  local ranking.
- Submit your site to Google Search Console once it's live to speed up indexing.

## Google Business Profile (GBP)
- Create/claim your profile at business.google.com. Choose the "Real estate
  agent" category, add your service area, hours, photos, and a link to your
  website.
- Verify (postcard, phone, or video) — you can't rank in the local map pack
  until verified.
- Keep it active: post weekly (new listings, closings, tips), answer questions,
  and respond to every review.
- Copy your GBP "place ID" into this CRM's sub-account settings so the review-
  request feature links straight to your review page.

## Common questions
- "Can I send SMS before A2P?" — Technically yes on a trial, but deliverability
  is poor and carriers may block. Register A2P before real outreach.
- "Do I need a domain for the chat widget or SEO?" — Yes, put your site on your
  own domain (see the Connect your domain setup step) for trust + SEO.`;
