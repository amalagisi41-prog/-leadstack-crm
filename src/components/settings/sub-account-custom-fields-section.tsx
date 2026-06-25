"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToCustomFields } from "@/lib/firestore/custom-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CUSTOM_FIELD_OPTION_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldDef,
  type CustomFieldEntity,
  type CustomFieldType,
} from "@/types/custom-fields";

/**
 * Custom-fields manager — define operator-specific fields on contacts and
 * deals. Admin-only. Definitions are read live; create/delete go through the
 * Admin-SDK routes. This is the definition surface; the values render on the
 * contact/deal forms (Phase 1b).
 */

const TYPE_OPTIONS = Object.keys(CUSTOM_FIELD_TYPE_LABELS) as CustomFieldType[];

export function SubAccountCustomFieldsSection() {
  const { subAccountId, isAdmin } = useSubAccount();
  const [entity, setEntity] = useState<CustomFieldEntity>("contact");
  const [fields, setFields] = useState<CustomFieldDef[]>([]);

  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!subAccountId) return;
    const unsub = subscribeToCustomFields(
      subAccountId,
      entity,
      setFields,
      () => {},
    );
    return () => unsub();
  }, [subAccountId, entity]);

  if (!isAdmin) return null;

  const needsOptions = CUSTOM_FIELD_OPTION_TYPES.has(type);

  async function addField() {
    if (!label.trim()) {
      toast.error("Give the field a label.");
      return;
    }
    const options = needsOptions
      ? optionsText.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (needsOptions && options.length === 0) {
      toast.error("Add at least one option (comma-separated).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/custom-fields`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity,
            label: label.trim(),
            type,
            options,
            required,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't add the field.");
        return;
      }
      toast.success("Custom field added.");
      setLabel("");
      setType("text");
      setOptionsText("");
      setRequired(false);
    } catch {
      toast.error("Couldn't add the field. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteField(id: string) {
    if (deletingId) return;
    if (
      !confirm(
        "Delete this custom field? Existing values stay on records but stop showing in forms.",
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/custom-fields/${id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't delete the field.");
        return;
      }
      toast.success("Custom field deleted.");
    } catch {
      toast.error("Couldn't delete the field. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <SlidersHorizontal className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Custom fields</h2>
          <p className="text-xs text-muted-foreground">
            Add your own fields to contacts and deals — text, numbers, dates,
            dropdowns, and more. They appear on the contact and deal forms and
            are the target for imported data when migrating from another CRM.
          </p>
        </div>
      </div>

      {/* Entity toggle */}
      <div className="mb-4 inline-flex rounded-lg border p-0.5 text-xs">
        {(["contact", "deal"] as CustomFieldEntity[]).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEntity(e)}
            className={cn(
              "rounded-md px-3 py-1 font-medium capitalize transition-colors",
              entity === e
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {e === "contact" ? "Contact fields" : "Deal fields"}
          </button>
        ))}
      </div>

      {/* Existing fields */}
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-background p-4 text-xs text-muted-foreground">
          No custom {entity} fields yet. Add one below.
        </p>
      ) : (
        <ul className="space-y-2">
          {fields.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2.5"
            >
              <span className="text-sm font-medium">{f.label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {CUSTOM_FIELD_TYPE_LABELS[f.type]}
              </span>
              {f.required && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  Required
                </span>
              )}
              {f.options.length > 0 && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {f.options.join(" · ")}
                </span>
              )}
              <code className="ml-auto text-[10px] text-muted-foreground/70">
                {f.key}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deletingId !== null}
                onClick={() => deleteField(f.id)}
                title="Delete field"
              >
                {deletingId === f.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Add field */}
      <div className="mt-4 space-y-3 rounded-lg border bg-background p-3">
        <p className="text-xs font-medium">Add a {entity} field</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cf-label">Label</Label>
            <Input
              id="cf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Industry"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-type">Type</Label>
            <select
              id="cf-type"
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {CUSTOM_FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {needsOptions && (
          <div className="space-y-1.5">
            <Label htmlFor="cf-options">Options (comma-separated)</Label>
            <Input
              id="cf-options"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="e.g. Plumbing, Electrical, HVAC"
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required
        </label>

        <Button type="button" size="sm" disabled={saving} onClick={addField}>
          {saving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1 h-3.5 w-3.5" />
          )}
          Add field
        </Button>
      </div>
    </section>
  );
}
