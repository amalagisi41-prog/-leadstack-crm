import type { BusinessProfileContent } from "@/types/business-profile";
import type { FormField } from "@/types/forms";

const GENERIC_PLACEHOLDERS = new Set([
  "",
  "jane doe",
  "jane@example.com",
  "+1 555 000 0000",
  "acme inc.",
  "tell us a bit about what you're looking for…",
]);

function usable(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Fill only safe, non-submitting form hints from the approved Blueprint.
 * Existing custom placeholders are preserved; no agent data is inserted as a
 * submitted value, so a lead can never accidentally submit the operator's
 * phone or email.
 */
export function prefillFormFields(
  fields: FormField[],
  profile: BusinessProfileContent
): FormField[] {
  const values: Record<NonNullable<FormField["mapsTo"]>, string> = {
    name: usable(profile.agentName),
    email: usable(profile.email),
    phone: usable(profile.phone),
    company: usable(profile.brokerage),
    notes: "Tell us a bit about what you're looking for…",
  };

  return fields.map((field) => {
    if (!field.mapsTo) return field;
    const value = values[field.mapsTo];
    const current = usable(field.placeholder);
    if (!value || (current && !GENERIC_PLACEHOLDERS.has(current.toLowerCase()))) {
      return field;
    }
    return { ...field, placeholder: value };
  });
}
