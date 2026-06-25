"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONDITION_OPS } from "@/lib/workflows/catalog";
import type { Condition, ConditionGroup, ConditionOp } from "@/types/workflows";

const COMMON_FIELDS = [
  "email",
  "phone",
  "name",
  "company",
  "source",
  "pipelineStage",
  "tags",
];

const NO_VALUE_OPS: ConditionOp[] = ["is_set", "not_set"];

export function ConditionsEditor({
  value,
  onChange,
}: {
  value: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
}) {
  const all = value?.all ?? [];

  const set = (next: Condition[]) => onChange({ all: next });
  const update = (i: number, patch: Partial<Condition>) =>
    set(all.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-2">
      {all.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No conditions — runs for everyone (trigger) / always takes the “yes”
          path (if/else).
        </p>
      )}
      {all.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            list="wf-fields"
            value={c.field}
            placeholder="field"
            onChange={(e) => update(i, { field: e.target.value })}
            className="h-8 flex-1"
          />
          <select
            value={c.op}
            onChange={(e) => update(i, { op: e.target.value as ConditionOp })}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            {CONDITION_OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {!NO_VALUE_OPS.includes(c.op) && (
            <Input
              value={c.value ?? ""}
              placeholder="value"
              onChange={(e) => update(i, { value: e.target.value })}
              className="h-8 flex-1"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => set(all.filter((_, j) => j !== i))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <datalist id="wf-fields">
        {COMMON_FIELDS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => set([...all, { field: "", op: "equals", value: "" }])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add condition
      </Button>
    </div>
  );
}
