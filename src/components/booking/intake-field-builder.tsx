"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { IntakeField } from "@/types/booking";

/**
 * Extra-questions builder for the public booking form. v1 supports
 * three field types: single-line text, multi-line text, and a single-
 * select dropdown. Name / email / phone are always collected and aren't
 * configurable here.
 *
 * Field ids are auto-slugged from the label on add so the operator
 * doesn't have to think about them, but the id is editable later if a
 * conflict arises (the validator enforces uniqueness on save).
 */

const TYPE_LABELS: Record<IntakeField["type"], string> = {
  text: "Short text",
  textarea: "Long text",
  select: "Dropdown",
};

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function uniqueId(base: string, existing: Set<string>): string {
  if (!base) base = "field";
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function IntakeFieldBuilder({
  value,
  onChange,
  disabled,
}: {
  value: IntakeField[];
  onChange: (next: IntakeField[]) => void;
  disabled?: boolean;
}) {
  function addField() {
    if (value.length >= 10) return;
    const existing = new Set(value.map((f) => f.id));
    const next: IntakeField = {
      id: uniqueId("question", existing),
      label: "",
      type: "text",
      required: false,
      options: null,
    };
    onChange([...value, next]);
  }

  function updateAt(idx: number, patch: Partial<IntakeField>) {
    const next = value.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange(next);
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2.5">
      <Label className="text-sm">Extra questions (optional)</Label>
      <p className="text-xs text-muted-foreground">
        Name, email, and phone are always asked. Add up to 10 extra
        questions — keep it short to lift completions.
      </p>

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed py-5 text-center text-xs text-muted-foreground">
          No extra questions yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {value.map((f, idx) => (
            <li
              key={idx}
              className="space-y-2 rounded-lg border bg-background p-3"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[160px] flex-1 space-y-1">
                  <Label className="text-xs" htmlFor={`q-label-${idx}`}>
                    Question
                  </Label>
                  <Input
                    id={`q-label-${idx}`}
                    value={f.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      // Only auto-slug the id while it still matches the
                      // previous auto-slug — preserves manual edits.
                      const prevAuto = slugifyLabel(f.label);
                      const stillAuto = f.id === prevAuto || f.id === "" || f.id.startsWith("question");
                      const existing = new Set(
                        value.filter((_, i) => i !== idx).map((x) => x.id),
                      );
                      const nextId = stillAuto
                        ? uniqueId(slugifyLabel(label), existing)
                        : f.id;
                      updateAt(idx, { label, id: nextId });
                    }}
                    placeholder="What would you like to discuss?"
                    disabled={disabled}
                    maxLength={120}
                  />
                </div>
                <div className="w-36 space-y-1">
                  <Label className="text-xs" htmlFor={`q-type-${idx}`}>
                    Type
                  </Label>
                  <select
                    id={`q-type-${idx}`}
                    value={f.type}
                    onChange={(e) => {
                      const type = e.target.value as IntakeField["type"];
                      updateAt(idx, {
                        type,
                        options: type === "select" ? (f.options ?? []) : null,
                      });
                    }}
                    disabled={disabled}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {(["text", "textarea", "select"] as const).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="mb-1 inline-flex cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      updateAt(idx, { required: e.target.checked })
                    }
                    disabled={disabled}
                    className="h-3.5 w-3.5"
                  />
                  Required
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAt(idx)}
                  disabled={disabled}
                  aria-label="Remove this question"
                  className="mb-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {f.type === "select" && (
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor={`q-opts-${idx}`}>
                    Options (one per line)
                  </Label>
                  <Textarea
                    id={`q-opts-${idx}`}
                    value={(f.options ?? []).join("\n")}
                    onChange={(e) => {
                      const opts = e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0);
                      updateAt(idx, { options: opts });
                    }}
                    rows={3}
                    placeholder={"30 min\n45 min\n60 min"}
                    disabled={disabled}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addField}
        disabled={disabled || value.length >= 10}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add question
      </Button>
    </div>
  );
}
