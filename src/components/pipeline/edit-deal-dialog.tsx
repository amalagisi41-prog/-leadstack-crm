"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubAccount } from "@/context/sub-account-context";
import { ContactPicker } from "@/components/quotes/contact-picker";
import { CustomFieldInputs } from "@/components/custom-fields/custom-field-inputs";
import { subscribeToCustomFields } from "@/lib/firestore/custom-fields";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";
import {
  DEAL_PRIORITIES,
  type Deal,
  type DealPriority,
  type PipelineStageId,
} from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Contact } from "@/types/contacts";
import type { CustomFieldDef, CustomFieldValue } from "@/types/custom-fields";
import { GLOBAL_TERRITORY_ID, type TerritoryDoc } from "@/types";

interface EditDealDialogProps {
  deal: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  territories: TerritoryDoc[];
}

export function EditDealDialog({
  deal,
  open,
  onOpenChange,
  contacts,
  territories,
}: EditDealDialogProps) {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const stages = usePipelineStages();
  // Changing the contact re-homes the deal's territory, which is an
  // admin-only action when scoping is on. Collaborators see it read-only.
  const canEditContact = !scopingOn || isAdmin;

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [stageId, setStageId] = useState<PipelineStageId>("new");
  const [priority, setPriority] = useState<DealPriority>("medium");
  const [contactId, setContactId] = useState("");
  const [cfDefs, setCfDefs] = useState<CustomFieldDef[]>([]);
  const [cfValues, setCfValues] = useState<Record<string, CustomFieldValue>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && deal) {
      setTitle(deal.title);
      setValue(deal.value ? String(deal.value) : "");
      setCurrency(deal.currency || "USD");
      setStageId(deal.stageId);
      setPriority(deal.priority ?? "medium");
      setContactId(deal.contactId);
      setCfValues(
        (deal.customFields ?? {}) as Record<string, CustomFieldValue>,
      );
      setErrors({});
    }
  }, [open, deal]);

  // Live custom-field definitions for deals (only while the sheet is open).
  useEffect(() => {
    if (!open || !subAccountId) {
      setCfDefs([]);
      return;
    }
    const unsub = subscribeToCustomFields(
      subAccountId,
      "deal",
      setCfDefs,
      () => {},
    );
    return () => unsub();
  }, [open, subAccountId]);

  const selectedContact = contacts.find((c) => c.id === contactId);

  const territoryNameById = new Map(territories.map((t) => [t.id, t.name]));
  const labelForTerritory = (id: string | null | undefined) =>
    !id || id === GLOBAL_TERRITORY_ID
      ? "Global"
      : (territoryNameById.get(id) ?? "Global");
  const territoryLabel = labelForTerritory(selectedContact?.territoryId);
  // Per-row territory chip in the contact picker — only when scoping is on.
  const contactTerritoryLabel = scopingOn
    ? (c: Contact) => labelForTerritory(c.territoryId)
    : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!deal) return;
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required";
    if (!contactId) next.contactId = "Pick a contact";
    const num = Number(value);
    if (value && (Number.isNaN(num) || num < 0)) next.value = "Enter a valid amount";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const cf = validateCustomFieldValues(cfValues, cfDefs);
    if (!cf.ok) {
      toast.error(cf.error);
      return;
    }

    setSaving(true);
    try {
      // Fields + stage in one PATCH — the server detects the stage change,
      // logs the move activity, and fires deal.updated (+ stage.changed /
      // won / lost) as needed.
      const base: Record<string, unknown> = {
        title: title.trim(),
        value: Number(value) || 0,
        currency,
        priority,
        stageId,
        customFields: cf.value,
      };
      // Only admins (or scoping-off) may re-home the contact. When they do,
      // the deal's territory follows the new contact. Collaborators send no
      // contact/territory change so the territoryId stays put (rules require
      // it). Re-deriving territory keeps the deal consistent with its contact.
      const contactChanged = contactId !== deal.contactId;
      if (canEditContact && contactChanged) {
        base.contactId = contactId;
        base.territoryId = selectedContact?.territoryId ?? GLOBAL_TERRITORY_ID;
      }
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(base),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't update deal. Try again.");
        return;
      }
      toast.success("Deal updated");
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update deal. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit Deal</SheetTitle>
          <SheetDescription>
            Update the deal&apos;s details. Stage changes are logged on the
            contact&apos;s timeline.
          </SheetDescription>
        </SheetHeader>

        <form className="space-y-4 p-4 pt-0" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="edit-deal-title">
              Deal title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-deal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Website rebuild — Acme"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="edit-deal-value">Value</Label>
              <Input
                id="edit-deal-value"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="5000"
                aria-invalid={!!errors.value}
              />
              {errors.value && (
                <p className="text-xs text-destructive">{errors.value}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-deal-currency">Currency</Label>
              <select
                id="edit-deal-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-8 w-24 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
              >
                {["USD", "AUD", "EUR", "GBP", "CAD"].map((c) => (
                  <option key={c} value={c} className="bg-background text-foreground">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-deal-stage">Stage</Label>
            <select
              id="edit-deal-stage"
              value={stageId}
              onChange={(e) => setStageId(e.target.value as PipelineStageId)}
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id} className="bg-background text-foreground">
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-deal-priority">Priority</Label>
            <select
              id="edit-deal-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as DealPriority)}
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
            >
              {DEAL_PRIORITIES.map((p) => (
                <option key={p.id} value={p.id} className="bg-background text-foreground">
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-deal-contact">
              Contact <span className="text-destructive">*</span>
            </Label>
            {canEditContact ? (
              <ContactPicker
                id="edit-deal-contact"
                contacts={contacts}
                value={contactId}
                onChange={setContactId}
                title="Pick a contact"
                territoryLabel={contactTerritoryLabel}
              />
            ) : (
              <div className="flex h-9 items-center rounded-lg border bg-muted/40 px-3 text-sm">
                {selectedContact?.name || selectedContact?.email || "Contact"}
              </div>
            )}
            {errors.contactId && (
              <p className="text-xs text-destructive">{errors.contactId}</p>
            )}
          </div>

          {scopingOn && (
            <div className="space-y-1.5">
              <Label>Territory</Label>
              <div className="flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm">
                <span className="font-medium">{territoryLabel}</span>
                <span className="text-[11px] text-muted-foreground">
                  · inherited from the contact
                </span>
              </div>
            </div>
          )}

          {cfDefs.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Custom fields
              </p>
              <CustomFieldInputs
                idPrefix="edit-deal-cf"
                defs={cfDefs}
                values={cfValues}
                onChange={setCfValues}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
