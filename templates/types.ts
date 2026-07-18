import type { WorkflowDoc } from "@/types/workflows";

/**
 * The Method Template Library — versioned config, not one-off automations.
 * Each template is a pure data module (trigger + node graph) that compiles
 * through the shared guardrail layer (src/lib/workflows/guardrails.ts) at
 * RUN time, not authoring time — the engine re-checks Fair Housing content,
 * escalation keywords, and quiet hours on every send regardless of where
 * the workflow came from.
 *
 * Every new sub-account inherits all four automatically at provisioning
 * time (see src/lib/provisioning/method-templates.ts) as ACTIVE workflows
 * the operator can see, edit, or pause from the Workflow Builder — "every
 * workflow should be editable but already built."
 */
export interface MethodTemplateDefinition {
  /** Stable machine key. Used as the seeded WorkflowDoc's `templateKey`
   *  (idempotency: a sub-account never gets the same Method Template
   *  seeded twice) and as the `template` value in the manual starter
   *  gallery. Never rename — treat as a permanent identifier. */
  key: string;
  /** Bumped whenever the shipped node graph changes meaningfully. Stamped
   *  onto the seeded WorkflowDoc as `templateVersion` at seed time so a
   *  future migration pass can detect + offer to update workspaces still
   *  running an older version. */
  version: number;
  displayName: string;
  /** One-line description shown in the starter gallery + provisioning log. */
  description: string;
  seed: () => Pick<WorkflowDoc, "trigger" | "nodes" | "startNodeId">;
}
