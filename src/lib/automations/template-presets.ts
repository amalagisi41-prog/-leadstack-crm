/**
 * Default template content shipped with every new sub-account.
 *
 * Single source of truth — used by:
 *   - `lib/automations/seed-templates.ts` (server-side seeder, runs at
 *     sub-account creation so every fresh sub-account starts with these
 *     two ready-to-use templates).
 *   - `app/(dashboard)/.../automations/templates/new/page.tsx` (client-side
 *     "Start from a preset" chips on the New Template page, so the operator
 *     can build a third / fourth template from the same starting points).
 *
 * Edit the bodies here and both surfaces update together. Don't copy-paste
 * into either consumer.
 */

import type { StepChannel } from "@/types/automations";

export interface TemplatePreset {
  /** Stable id used by the React key on preset chips. Not persisted. */
  id: string;
  /** Operator-facing label on the chip. Becomes the doc's `name`. */
  label: string;
  /** Tooltip explaining when to pick this preset. */
  description: string;
  type: StepChannel;
  /** Email-only. Empty string for SMS — the doc's `subject` field is null on SMS. */
  subject: string;
  body: string;
}

export const TEMPLATE_PRESETS: ReadonlyArray<TemplatePreset> = [
  {
    id: "welcome-email",
    label: "Welcome email",
    description: "Polite thanks-and-confirmation after a form submit.",
    type: "email",
    subject: "Thanks for getting in touch, {{contact.firstName}}",
    body: `Hi {{contact.firstName}},

Thanks for reaching out to {{workspace.name}} — your message landed and we'll be in touch within 24 hours.

If anything's urgent in the meantime, just reply to this email.

Cheers,
{{owner.firstName}}

—
Don't want emails like this? {{unsubscribeLink}}`,
  },
  {
    id: "welcome-sms",
    label: "Welcome SMS",
    description: "Short reply that sets expectations.",
    type: "sms",
    subject: "",
    body: "Hi {{contact.firstName}}, thanks for reaching out to {{workspace.name}} — we'll be in touch within 24 hours. Reply STOP to opt out.",
  },
  {
    id: "notify-owner-email",
    label: "Notify owner",
    description:
      "Internal email alert when a new lead comes in. Pair with Step 3 of Speed-to-Lead.",
    type: "email",
    subject: "New lead: {{contact.firstName}} {{contact.lastName}}",
    body: `A new lead just submitted a form on {{workspace.name}}.

Name:  {{contact.firstName}} {{contact.lastName}}
Email: {{contact.email}}
Phone: {{contact.phone}}

Reply to them directly at {{contact.email}}, or open the lead in your CRM.

—
{{unsubscribeLink}}`,
  },
];
