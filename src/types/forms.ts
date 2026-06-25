import type { Timestamp, FieldValue } from "firebase/firestore";
import type { PipelineStageId } from "@/types/deals";

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "company"
  | "textarea"
  | "select"
  // A2P 10DLC SMS opt-in consent checkbox. Renders an unchecked checkbox with
  // a compliance disclosure (the `consentText`). When checked, the submit
  // route records an audit trail on the contact + clears `smsOptedOut`; when
  // a form HAS a consent field and the box is left unchecked, the contact is
  // created `smsOptedOut: true` (no consent → never SMS them). Forms without
  // a consent field keep the existing default behaviour.
  | "sms_consent";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder: string;
  required: boolean;
  options: string[];
  // Maps this field's value back to the Contact shape.
  // "name" | "email" | "phone" | "company" | "notes" | null
  mapsTo: "name" | "email" | "phone" | "company" | "notes" | null;
  /**
   * Only used by the `sms_consent` field type — the disclosure paragraph
   * rendered next to the checkbox (and stored verbatim as the proof-of-consent
   * text). Must carry the CTIA-required elements: sender identity, message
   * frequency, "message & data rates may apply", and STOP/HELP instructions.
   */
  consentText?: string;
}

/**
 * CTIA-compliant default SMS-consent disclosure. The operator edits this in
 * the builder; the business name is injected at field-creation time. Operators
 * should also surface their Privacy Policy + Terms links on the form/page per
 * carrier requirements.
 */
export function defaultSmsConsentText(businessName?: string): string {
  const biz = (businessName && businessName.trim()) || "us";
  return `By checking this box, you agree to receive SMS messages from ${biz}. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.`;
}

/**
 * Visual customisation for the public form page. Used by the form-builder
 * "Embed appearance" panel + by the public form's URL params (params win
 * for one-off overrides without saving).
 */
export interface FormAppearance {
  theme: "light" | "dark";
  /** Hex string with leading #. Drives the submit button + focus ring. */
  accent: string;
  /** Hide the LeadStack header + "Powered by" footer when embedded. */
  hideChrome: boolean;
  /**
   * Hide the form name + "Fill this out…" tagline above the fields. Use
   * when the host page already has its own heading above the iframe.
   */
  hideTitle: boolean;
}

export interface FormSettings {
  pipelineStageId: PipelineStageId | null;
  autoTags: string[];
  thankYouMessage: string;
  redirectUrl: string;
  createDeal: boolean;
  dealTitleTemplate: string;
  dealValue: number;
  dealCurrency: string;
  appearance: FormAppearance;
}

export interface LeadForm {
  id: string;
  name: string;
  slug: string;
  fields: FormField[];
  settings: FormSettings;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  enabled: boolean;
  submissionCount: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface FormSubmission {
  id: string;
  formId: string;
  values: Record<string, string>;
  contactId: string | null;
  dealId: string | null;
  createdAt: Timestamp | FieldValue | null;
}

/**
 * Form template variants exposed by the "New form" UI. "blank" is the
 * existing default; "contact" is a typical website contact form (Name,
 * Email, Phone, Message). Add new presets here and surface them in the
 * forms list page when needed.
 */
export type FormTemplate = "blank" | "contact";

export function defaultFormFields(): FormField[] {
  return [
    {
      id: "name",
      type: "text",
      label: "Full name",
      placeholder: "Jane Doe",
      required: true,
      options: [],
      mapsTo: "name",
    },
    {
      id: "email",
      type: "email",
      label: "Email",
      placeholder: "jane@example.com",
      required: true,
      options: [],
      mapsTo: "email",
    },
    {
      id: "phone",
      type: "phone",
      label: "Phone",
      placeholder: "+1 555 000 0000",
      required: false,
      options: [],
      mapsTo: "phone",
    },
    {
      id: "company",
      type: "company",
      label: "Company",
      placeholder: "Acme Inc.",
      required: false,
      options: [],
      mapsTo: "company",
    },
  ];
}

/**
 * Fields for the "Contact form" preset. Drops Company (most generic contact
 * forms don't ask), adds a required Message textarea that maps to the
 * contact's notes field so the body lands on the contact profile timeline.
 */
export function contactFormFields(): FormField[] {
  return [
    {
      id: "name",
      type: "text",
      label: "Full name",
      placeholder: "Jane Doe",
      required: true,
      options: [],
      mapsTo: "name",
    },
    {
      id: "email",
      type: "email",
      label: "Email",
      placeholder: "jane@example.com",
      required: true,
      options: [],
      mapsTo: "email",
    },
    {
      id: "phone",
      type: "phone",
      label: "Phone",
      placeholder: "+1 555 000 0000",
      required: false,
      options: [],
      mapsTo: "phone",
    },
    {
      id: "message",
      type: "textarea",
      label: "How can we help?",
      placeholder: "Tell us a bit about what you're looking for…",
      required: true,
      options: [],
      mapsTo: "notes",
    },
  ];
}

export function contactFormSettings(): FormSettings {
  return {
    ...defaultFormSettings(),
    thankYouMessage:
      "Thanks for reaching out — we'll get back to you shortly.",
    autoTags: ["form", "contact"],
  };
}

export function defaultFormSettings(): FormSettings {
  return {
    pipelineStageId: "new",
    autoTags: ["form"],
    thankYouMessage: "Thanks — we'll be in touch shortly.",
    redirectUrl: "",
    createDeal: false,
    dealTitleTemplate: "New lead — {name}",
    dealValue: 0,
    dealCurrency: "USD",
    appearance: defaultFormAppearance(),
  };
}

export function defaultFormAppearance(): FormAppearance {
  return {
    theme: "light",
    accent: "#7c3aed",
    hideChrome: false,
    hideTitle: false,
  };
}
