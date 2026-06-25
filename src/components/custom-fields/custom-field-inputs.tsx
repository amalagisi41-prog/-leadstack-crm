"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  CustomFieldDef,
  CustomFieldValue,
} from "@/types/custom-fields";

/**
 * Renders editable inputs for a set of custom-field definitions, shared by the
 * contact form and the deal dialogs. Controlled: the parent owns the
 * `values` map (keyed by each def's `key`) and gets a new map on every change.
 *
 * Type → control:
 *   text/url/phone/email → text input (typed)
 *   number               → number input
 *   date                 → date input (yyyy-mm-dd)
 *   checkbox             → single checkbox
 *   dropdown             → select
 *   multiselect          → checkbox list
 */
export function CustomFieldInputs({
  defs,
  values,
  onChange,
  disabled,
  idPrefix = "cf",
}: {
  defs: CustomFieldDef[];
  values: Record<string, CustomFieldValue>;
  onChange: (next: Record<string, CustomFieldValue>) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  if (defs.length === 0) return null;

  function set(key: string, v: CustomFieldValue) {
    onChange({ ...values, [key]: v });
  }

  return (
    <div className="space-y-4">
      {defs.map((def) => {
        const id = `${idPrefix}-${def.key}`;
        const raw = values[def.key];
        const labelEl = (
          <Label htmlFor={id}>
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
        );

        if (def.type === "checkbox") {
          return (
            <label key={def.id} className="flex items-center gap-2 text-sm">
              <input
                id={id}
                type="checkbox"
                className="h-4 w-4"
                disabled={disabled}
                checked={raw === true}
                onChange={(e) => set(def.key, e.target.checked)}
              />
              {def.label}
              {def.required && <span className="text-destructive">*</span>}
            </label>
          );
        }

        if (def.type === "dropdown") {
          return (
            <div key={def.id} className="space-y-1.5">
              {labelEl}
              <select
                id={id}
                disabled={disabled}
                value={typeof raw === "string" ? raw : ""}
                onChange={(e) => set(def.key, e.target.value || null)}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
              >
                <option value="">—</option>
                {def.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (def.type === "multiselect") {
          const selected = Array.isArray(raw) ? raw : [];
          return (
            <div key={def.id} className="space-y-1.5">
              {labelEl}
              <div className="flex flex-wrap gap-2">
                {def.options.map((o) => {
                  const on = selected.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        set(
                          def.key,
                          on
                            ? selected.filter((x) => x !== o)
                            : [...selected, o],
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        // text / number / date / url / phone / email
        const inputType =
          def.type === "number"
            ? "number"
            : def.type === "date"
              ? "date"
              : def.type === "url"
                ? "url"
                : def.type === "phone"
                  ? "tel"
                  : def.type === "email"
                    ? "email"
                    : "text";
        return (
          <div key={def.id} className="space-y-1.5">
            {labelEl}
            <Input
              id={id}
              type={inputType}
              disabled={disabled}
              value={raw == null ? "" : String(raw)}
              onChange={(e) => {
                const v = e.target.value;
                if (def.type === "number") {
                  set(def.key, v === "" ? null : Number(v));
                } else {
                  set(def.key, v === "" ? null : v);
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
