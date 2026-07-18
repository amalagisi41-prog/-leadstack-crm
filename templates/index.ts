import { missedCallTextback } from "./missed-call-textback";
import { newLeadInstantResponse } from "./new-lead-instant-response";
import { postClosingReviewRequest } from "./post-closing-review-request";
import { coldLead90DayRevival } from "./cold-lead-90-day-revival";
import type { MethodTemplateDefinition } from "./types";

export type { MethodTemplateDefinition } from "./types";

/**
 * The four Method Templates, in the canonical order every new workspace
 * inherits them (see src/lib/provisioning/method-templates.ts). Adding a
 * fifth template: create its file, add it here, and it's automatically
 * picked up by both the provisioning seeder and the starter gallery
 * (src/lib/workflows/starter-templates.ts re-exports these).
 */
export const METHOD_TEMPLATES: MethodTemplateDefinition[] = [
  missedCallTextback,
  newLeadInstantResponse,
  postClosingReviewRequest,
  coldLead90DayRevival,
];

export function getMethodTemplate(
  key: string,
): MethodTemplateDefinition | undefined {
  return METHOD_TEMPLATES.find((t) => t.key === key);
}

export {
  missedCallTextback,
  newLeadInstantResponse,
  postClosingReviewRequest,
  coldLead90DayRevival,
};
