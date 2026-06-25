import type { Timestamp, FieldValue } from "firebase/firestore";

export type PipelineStageId =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  tone: string;
  terminal?: "won" | "lost";
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { id: "new", label: "New", tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
  { id: "contacted", label: "Contacted", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  { id: "qualified", label: "Qualified", tone: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  { id: "proposal", label: "Proposal", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { id: "won", label: "Won", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", terminal: "won" },
  { id: "lost", label: "Lost", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300", terminal: "lost" },
];

/**
 * Resolve the pipeline stage for an id. Accepts an optional resolved stage
 * list (from `resolvePipelineStages`) so callers with the sub-account's
 * label/order overrides get the right label; defaults to the canonical
 * constant for server code that only needs ids + terminal flags.
 */
export function getStage(
  id: PipelineStageId | string | null | undefined,
  stages: PipelineStage[] = PIPELINE_STAGES,
): PipelineStage {
  return stages.find((s) => s.id === id) ?? stages[0] ?? PIPELINE_STAGES[0];
}

/**
 * Per-sub-account override of a canonical stage's display. ONLY `label` and
 * `order` are operator-editable — `id` and `terminal` always come from the
 * canonical {@link PIPELINE_STAGES}, so renaming/reordering can never change
 * a deal's stored stageId, remove the won/lost terminals, or affect the
 * public API / webhooks / reports math. See "Phase 2 (2A)".
 */
export interface PipelineStageOverride {
  id: PipelineStageId;
  label: string;
  order: number;
}

/**
 * Merge a sub-account's label/order overrides onto the canonical stages.
 * Terminal flags, ids, and tones always come from the canonical definition.
 * Absent / empty / invalid overrides return the canonical list unchanged
 * (byte-identical to pre-Phase-2 behaviour) — the opt-in default path.
 */
export function resolvePipelineStages(
  overrides?: PipelineStageOverride[] | null,
): PipelineStage[] {
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return PIPELINE_STAGES;
  }
  const byId = new Map(overrides.map((o) => [o.id, o]));
  const withOrder = PIPELINE_STAGES.map((s, idx) => {
    const o = byId.get(s.id);
    const label =
      o && typeof o.label === "string" && o.label.trim().length > 0
        ? o.label
        : s.label;
    const order =
      o && typeof o.order === "number" && Number.isFinite(o.order)
        ? o.order
        : idx;
    // id, tone, terminal are NEVER taken from the override.
    return { stage: { ...s, label } as PipelineStage, order, idx };
  });
  withOrder.sort((a, b) => a.order - b.order || a.idx - b.idx);
  return withOrder.map((x) => x.stage);
}

export type DealPriority = "high" | "medium" | "low";

export interface DealPriorityOption {
  id: DealPriority;
  label: string;
  badge: string;
}

export const DEAL_PRIORITIES: DealPriorityOption[] = [
  {
    id: "high",
    label: "High",
    badge: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300",
  },
  {
    id: "medium",
    label: "Medium",
    badge: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300",
  },
  {
    id: "low",
    label: "Low",
    badge: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300",
  },
];

export function getPriority(
  id: DealPriority | string | null | undefined,
): DealPriorityOption {
  return (
    DEAL_PRIORITIES.find((p) => p.id === id) ??
    DEAL_PRIORITIES[1]
  );
}

export interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  contactId: string;
  stageId: PipelineStageId;
  priority: DealPriority;
  // Tenancy keys (replace the legacy ownerId).
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  lostReason: string | null;
  /**
   * Set when the operator ticks "Completed" on a Won deal card — marks the
   * job/work as actually delivered (distinct from the deal being Won). Drives
   * the optional Google review-request trigger (`triggerOnDealCompleted`).
   * Undefined on legacy docs / deals never marked complete.
   */
  completed?: boolean;
  completedAt?: Timestamp | FieldValue | null;
  /**
   * Operator-defined custom field values, keyed by the custom-field
   * definition's `key` (see {@link CustomFieldDef}). Optional/absent on legacy
   * docs. Validated server-side against the sub-account's deal field
   * definitions on create/update.
   */
  customFields?: Record<string, import("./custom-fields").CustomFieldValue> | null;
  /**
   * Territory id when the sub-account has opted into territory scoping.
   * Defaults to the reserved "global" id (the shared floor) — new docs are
   * never unassigned. `null`/undefined only appears on legacy docs and is
   * treated as Global. Ignored when `territoryScopingEnabled` is not true.
   */
  territoryId?: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  stageChangedAt: Timestamp | FieldValue | null;
}

export type DealFormData = {
  title: string;
  value: number;
  currency: string;
  contactId: string;
  stageId: PipelineStageId;
  priority: DealPriority;
  territoryId?: string | null;
  customFields?: Record<string, import("./custom-fields").CustomFieldValue> | null;
};
