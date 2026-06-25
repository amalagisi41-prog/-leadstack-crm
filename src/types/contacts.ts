import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * How a Contact entered the CRM. Stored as a free-form string on the doc
 * (so a UTM source like "google" can flow through) but the union below
 * names the values the UI has explicit badges / labels for.
 *
 *   - "website-form"  Submitted a public hosted form at /f/[id]. (Preferred.)
 *   - "web-chat"      Captured via the AI Agents web chat widget.
 *   - "booking-page"  Booked a slot via a native /b/[saId]/[slug] page.
 *   - "website"       Legacy generic — predates the form/chat split. Still
 *                     selectable in the manual-create UI as a catch-all.
 *   - "referral" / "ads" / "other"  Manual-entry options.
 *   - "facebook" / "instagram"  Auto-set when a contact is created from a
 *                     BETA Facebook Messenger / Instagram DM inbound. Not
 *                     manual-create options — the Meta webhook stamps them.
 *   - ""              Unknown — no badge rendered.
 */
export type ContactSource =
  | "website-form"
  | "web-chat"
  | "booking-page"
  | "community"
  | "website"
  | "referral"
  | "ads"
  | "other"
  | "facebook"
  | "instagram"
  | "";

/**
 * Marketing attribution captured at contact creation time. Populated by
 * /api/forms/[id]/submit when the hosted form page (/f/[id]) forwards
 * the original URL params + referrer from the visit that converted.
 *
 * All fields are nullable — contacts created via CSV import, manual
 * entry, or pre-attribution-capture submissions will have null values.
 * Stored on the contact (not the submission) so downstream events like
 * pipeline-stage changes can reference the original attribution when
 * firing Meta Conversions API events.
 */
export interface ContactAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclid: string | null;
  gclid: string | null;
  landingPage: string | null;
  referrer: string | null;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  /** Free-form billing/postal address. Surfaced under "Billed to" on
   *  quotes + invoices (snapshotted onto the doc at contact pick time
   *  so historical docs aren't mutated when the contact's address
   *  later changes). Multi-line; operator types whatever format suits
   *  their region. Empty string when not provided. */
  address: string;
  source: ContactSource;
  tags: string[];
  pipelineStage: string | null;
  attribution: ContactAttribution | null;
  /**
   * Operator-defined custom field values, keyed by the custom-field
   * definition's `key` (see {@link CustomFieldDef}). Optional/absent on legacy
   * docs and contacts with no custom fields set. Validated server-side against
   * the sub-account's field definitions on create/update.
   */
  customFields?: Record<string, import("./custom-fields").CustomFieldValue> | null;
  // Tenancy keys (replace the legacy ownerId).
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  // Compliance flags. Flipped by the unsubscribe page (email) and the
  // Twilio inbound webhook (sms STOP). The automation step executor
  // checks these before sending and logs `automation_step_skipped`.
  emailOptedOut: boolean;
  smsOptedOut: boolean;
  /**
   * A2P 10DLC proof-of-consent audit record, written when a contact opts in
   * to SMS via a form's `sms_consent` field. Carriers / The Campaign Registry
   * expect a retrievable record of WHO consented, to WHAT exact text, and
   * WHEN/WHERE. Null/undefined = no captured consent (e.g. manually-created
   * contacts, or forms without a consent field). Independent of `smsOptedOut`,
   * which is the live send-gate; this is the historical evidence.
   */
  smsConsent?: {
    consented: boolean;
    /** The exact disclosure text shown at opt-in time. */
    textShown: string;
    consentedAt: Timestamp | FieldValue | null;
    /** Page the form was submitted from (from attribution.landingPage). */
    sourceUrl: string | null;
    ip: string | null;
  } | null;
  /**
   * Voice-specific opt-out, independent of `smsOptedOut` — an SMS STOP
   * stops texts but not calls, and vice-versa. Checked by the outbound
   * voice compliance gate before any AI call is placed. Operator-toggled
   * on the contact (no inbound auto-flip in Phase 1). Legacy/undefined
   * reads as not-opted-out.
   */
  voiceOptedOut?: boolean;
  /**
   * WhatsApp-specific opt-out, independent of `smsOptedOut` — WhatsApp is a
   * separate channel with its own STOP handling. Flipped by the WhatsApp
   * inbound webhook on a STOP-style message and checked before any WhatsApp
   * reply (AI or manual) is sent. Legacy/undefined reads as not-opted-out.
   */
  whatsappOptedOut?: boolean;
  /**
   * Denormalised stamp of the last outbound AI call placed to this contact
   * (campaign or click-to-call). Powers the "don't re-call recently
   * contacted" suppression on bulk campaigns without scanning every
   * campaign. Undefined = never called.
   */
  lastOutboundCallAt?: Timestamp | FieldValue | null;
  /** Campaign id of that last outbound call (null for click-to-call). */
  lastOutboundCampaignId?: string | null;
  /**
   * Stamp of the last Google review request sent to this contact. Powers the
   * cooldown that stops auto-triggers re-asking the same person. Undefined =
   * never asked.
   */
  reviewRequestedAt?: Timestamp | FieldValue | null;
  /**
   * Page-scoped Meta user id (PSID / IGSID) for a contact who has messaged this
   * sub-account via the BETA Facebook Messenger / Instagram DM inbox. Server-
   * managed (stamped by /api/webhooks/meta on first inbound) and used to
   * reconcile subsequent Meta messages to the same contact — Meta DMs carry no
   * phone/email. Undefined for every non-Meta contact.
   */
  metaUserId?: string | null;
  /**
   * Best-effort location, captured at contact creation. Populated by
   * /api/forms/[id]/submit via ipapi.co (city + lat/lng) with a phone
   * country-code fallback (country only, lat/lng resolved to country
   * centroid client-side). Null for contacts created before location
   * capture shipped, or when neither path resolved.
   */
  countryCode: string | null;
  country: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  /**
   * Territory id when the sub-account has opted into territory scoping.
   * Defaults to the reserved "global" id (the shared floor) — new docs are
   * never unassigned. `null`/undefined only appears on legacy docs and is
   * treated as Global. Ignored when `territoryScopingEnabled` is not true.
   */
  territoryId?: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export type ContactFormData = Pick<
  Contact,
  "name" | "email" | "phone" | "company" | "address" | "source" | "tags"
> & {
  territoryId?: string | null;
  customFields?: Record<string, import("./custom-fields").CustomFieldValue> | null;
};

export type ActivityType =
  | "note_added"
  | "booking_created"
  | "pipeline_moved"
  | "task_completed"
  | "form_submitted"
  | "email_sent"
  | "sms_sent"
  | "whatsapp_sent"
  // Operator replied on the BETA Facebook Messenger / Instagram DM inbox.
  // Written by /api/comms/meta/send.
  | "messenger_sent"
  | "instagram_sent"
  | "automation_started"
  | "automation_step_sent"
  | "automation_step_skipped"
  | "automation_completed"
  | "automation_failed"
  | "ai_reply_sent"
  | "ai_escalated"
  | "ai_skipped"
  // Operator placed an outbound AI voice call from the contact profile.
  // Written by /api/comms/voice/call after the compliance gate passes.
  | "voice_call_initiated"
  // Quote lifecycle — written by the quote API routes + the public
  // /q/[token] page on first view. See lib/quotes/lifecycle.ts.
  | "quote_sent"
  | "quote_viewed"
  | "quote_accepted"
  | "quote_declined"
  | "quote_marked_paid"
  // Google review request sent (SMS / WhatsApp) — written by
  // lib/reviews/request.ts on a manual or quote-paid-triggered send.
  | "review_requested"
  // Written by the admin-only territory-retag route when a contact
  // (the account) moves between territories. The cascade also re-tags
  // every linked deal / quote / task / event — that's logged via this
  // single activity entry, not one per child.
  | "contact_territory_changed"
  // Booking-page lifecycle. `booking_page_booked` fires on a successful
  // public booking (distinct from `booking_created` which logs any new
  // calendar event). The payment / cancelled / rescheduled / no_show /
  // completed entries trace the rest of the lifecycle. See
  // src/lib/booking/lifecycle.ts (Slice 4+).
  | "booking_page_booked"
  | "booking_payment_received"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "booking_no_show"
  | "booking_completed"
  // Operator/host reassigned a team booking to a different host. Written by
  // /api/events/by-id/[id]/assign.
  | "booking_reassigned";

export interface Note {
  id: string;
  content: string;
  createdBy: string;
  createdAt: Timestamp | FieldValue | null;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  content: string;
  createdAt: Timestamp | FieldValue | null;
  createdBy: string;
}
