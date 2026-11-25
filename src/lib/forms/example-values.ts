/**
 * Example values shown as input placeholders on settings forms. They are
 * illustrations only: a field holding one of these is EMPTY, never the
 * customer's data. Hydration treats a stored copy as empty, and the save
 * routes refuse to persist one, so a demo value can never sit in a form
 * looking like a real saved setting.
 */
export const EXAMPLE_VALUES = {
  contactName: "Jane Doe",
  contactEmail: "jane@acme.com",
  contactPhone: "+15551234567",
  agencyName: "Acme Marketing Co.",
  logoUrl: "https://yourcdn.com/agency-logo.svg",
  supportEmail: "hello@yourbrand.com",
  primaryDomain: "yourbrand.com",
} as const;

const KNOWN = new Set(
  Object.values(EXAMPLE_VALUES).map((v) => v.trim().toLowerCase())
);

export function isExampleValue(value: string | null | undefined): boolean {
  return !!value && KNOWN.has(value.trim().toLowerCase());
}

/** The stored value, or "" when it is missing or one of the examples. */
export function realValueOrEmpty(value: string | null | undefined): string {
  return value && !isExampleValue(value) ? value : "";
}

/** Placeholder text, plainly marked as an example. */
export function examplePlaceholder(value: string): string {
  return `e.g. ${value}`;
}

/** Placeholder styling that can't be mistaken for a typed value. */
export const EXAMPLE_PLACEHOLDER_CLASS =
  "placeholder:italic placeholder:text-muted-foreground/60";
