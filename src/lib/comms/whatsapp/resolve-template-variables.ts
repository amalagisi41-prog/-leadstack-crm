import { resolveMergeTags, type MergeTagSubject } from "@/lib/automations/merge-tags";
import type { WhatsappTemplateVariable } from "@/types/whatsapp-templates";

/**
 * Resolve a WhatsApp template's positional variables into the ordered value
 * array Twilio expects (index 0 → {{1}}, index 1 → {{2}}, …).
 *
 * Per variable:
 *   - an explicit non-empty `manualValues[position]` always wins (lets the
 *     composer override even a merge-tag-mapped field);
 *   - otherwise a `merge_tag` variable resolves against the subject (reusing
 *     the automation merge-tag resolver, so behaviour matches email/SMS);
 *   - otherwise (manual with no value) it resolves to empty string.
 *
 * Pure + dependency-light so both the server send paths and the client
 * composer (for live preview) can call it.
 */
export function resolveTemplateVariables(input: {
  variables: WhatsappTemplateVariable[];
  subject: MergeTagSubject;
  manualValues?: Record<number, string>;
}): string[] {
  const manual = input.manualValues ?? {};
  return [...input.variables]
    .sort((a, b) => a.position - b.position)
    .map((v) => {
      const override = manual[v.position];
      if (override !== undefined && override.trim() !== "") return override;
      if (v.source === "merge_tag" && v.mergeTag) {
        return resolveMergeTags(`{{${v.mergeTag}}}`, input.subject);
      }
      return override ?? "";
    });
}

/** Positions that require operator input (manual source) — used by the
 *  composer to render only the fields a human must fill. */
export function manualVariablePositions(
  variables: WhatsappTemplateVariable[],
): number[] {
  return variables
    .filter((v) => v.source === "manual")
    .map((v) => v.position)
    .sort((a, b) => a - b);
}
