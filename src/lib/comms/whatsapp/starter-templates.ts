import type {
  WhatsappTemplateCategory,
  WhatsappTemplateVariable,
} from "@/types/whatsapp-templates";

/**
 * Curated starter gallery for WhatsApp templates. Each entry pre-fills the
 * template builder with a clean, policy-compliant body that approves far
 * more reliably than an improvised one, mapped to a LeadStack feature the
 * operator already uses. Selecting a starter is a starting point — the
 * operator edits wording + variables before submitting, and each template
 * still goes through Meta approval individually.
 *
 * Pure data (no server-only) so the gallery picker can import it directly.
 * Keep the bodies clean-utility where possible — a UTILITY template with a
 * promotional line gets reclassified by Meta as MARKETING (pricier, stricter).
 */

export interface WhatsappStarterTemplate {
  /** Stable key for the gallery (also the default Meta template name). */
  key: string;
  displayName: string;
  /** One-line description shown in the gallery card. */
  description: string;
  /** The existing LeadStack feature this mirrors. */
  mapsTo: string;
  category: WhatsappTemplateCategory;
  language: string;
  body: string;
  variables: WhatsappTemplateVariable[];
}

export const WHATSAPP_STARTER_TEMPLATES: WhatsappStarterTemplate[] = [
  {
    key: "lead_acknowledgement",
    displayName: "Lead acknowledgement",
    description:
      "Auto-confirm you received a new enquiry. Pairs with Speed-to-Lead / form submits.",
    mapsTo: "Forms / Speed-to-Lead",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, thanks for reaching out to {{2}}! We've got your enquiry and someone will be in touch shortly.",
    variables: [
      { position: 1, label: "First name", sampleValue: "Ben", source: "merge_tag", mergeTag: "contact.firstName" },
      { position: 2, label: "Business name", sampleValue: "Acme Plumbing", source: "merge_tag", mergeTag: "workspace.name" },
    ],
  },
  {
    key: "booking_confirmation",
    displayName: "Booking confirmation",
    description: "Confirm a newly booked appointment with date + time.",
    mapsTo: "Booking pages",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, your booking with {{2}} is confirmed for {{3}}. Need to change it? Just reply here.",
    variables: [
      { position: 1, label: "First name", sampleValue: "Ben", source: "merge_tag", mergeTag: "contact.firstName" },
      { position: 2, label: "Business name", sampleValue: "Acme Plumbing", source: "merge_tag", mergeTag: "workspace.name" },
      { position: 3, label: "Appointment date/time", sampleValue: "Tue 12 Mar, 2:00pm", source: "manual", mergeTag: null },
    ],
  },
  {
    key: "booking_reminder",
    displayName: "Appointment reminder",
    description: "Remind a contact of an upcoming appointment.",
    mapsTo: "Booking pages (reminder step)",
    category: "UTILITY",
    language: "en",
    body: "Reminder: you have an appointment with {{1}} on {{2}}. Reply here if you need to reschedule.",
    variables: [
      { position: 1, label: "Business name", sampleValue: "Acme Plumbing", source: "merge_tag", mergeTag: "workspace.name" },
      { position: 2, label: "Appointment date/time", sampleValue: "Tue 12 Mar, 2:00pm", source: "manual", mergeTag: null },
    ],
  },
  {
    key: "quote_ready",
    displayName: "Quote ready",
    description: "Let a contact know their quote is ready to view, with a link.",
    mapsTo: "Quotes (sent)",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, your quote from {{2}} is ready to view: {{3}}. Happy to answer any questions.",
    variables: [
      { position: 1, label: "First name", sampleValue: "Ben", source: "merge_tag", mergeTag: "contact.firstName" },
      { position: 2, label: "Business name", sampleValue: "Acme Plumbing", source: "merge_tag", mergeTag: "workspace.name" },
      { position: 3, label: "Quote link", sampleValue: "https://example.com/q/abc123", source: "manual", mergeTag: null },
    ],
  },
  {
    key: "payment_reminder",
    displayName: "Payment reminder",
    description: "Remind a contact about a due invoice, with a pay link.",
    mapsTo: "Invoices",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, a friendly reminder that invoice {{2}} for {{3}} is due. You can pay here: {{4}}.",
    variables: [
      { position: 1, label: "First name", sampleValue: "Ben", source: "merge_tag", mergeTag: "contact.firstName" },
      { position: 2, label: "Invoice number", sampleValue: "INV-2026-0001", source: "manual", mergeTag: null },
      { position: 3, label: "Amount", sampleValue: "$420.00", source: "manual", mergeTag: null },
      { position: 4, label: "Pay link", sampleValue: "https://paypal.me/acme/420", source: "manual", mergeTag: null },
    ],
  },
  {
    key: "re_engagement",
    displayName: "Re-engagement",
    description: "Win back a contact who went quiet. Marketing category.",
    mapsTo: "Manual / re-engagement",
    category: "MARKETING",
    language: "en",
    body: "Hi {{1}}, just checking in — are you still interested in {{2}}? Reply here and we'll pick up where we left off. Reply STOP to opt out.",
    variables: [
      { position: 1, label: "First name", sampleValue: "Ben", source: "merge_tag", mergeTag: "contact.firstName" },
      { position: 2, label: "Service / topic", sampleValue: "the bathroom reno", source: "manual", mergeTag: null },
    ],
  },
  {
    key: "review_request",
    displayName: "Review request",
    description: "Ask a happy customer for a review, with a link. Marketing category.",
    mapsTo: "Manual / post-job",
    category: "MARKETING",
    language: "en",
    body: "Hi {{1}}, thanks for choosing {{2}}! If you've got 30 seconds, we'd love a quick review: {{3}}. Reply STOP to opt out.",
    variables: [
      { position: 1, label: "First name", sampleValue: "Ben", source: "merge_tag", mergeTag: "contact.firstName" },
      { position: 2, label: "Business name", sampleValue: "Acme Plumbing", source: "merge_tag", mergeTag: "workspace.name" },
      { position: 3, label: "Review link", sampleValue: "https://g.page/acme/review", source: "manual", mergeTag: null },
    ],
  },
];

export function getStarterTemplate(
  key: string,
): WhatsappStarterTemplate | undefined {
  return WHATSAPP_STARTER_TEMPLATES.find((t) => t.key === key);
}
