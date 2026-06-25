"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { ContactPicker } from "@/components/quotes/contact-picker";
import { CustomFieldInputs } from "@/components/custom-fields/custom-field-inputs";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { subscribeToCustomFields } from "@/lib/firestore/custom-fields";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";
import type { CustomFieldDef, CustomFieldValue } from "@/types/custom-fields";
import { GLOBAL_TERRITORY_ID, type TerritoryDoc } from "@/types";
import {
  DEAL_PRIORITIES,
  type DealFormData,
  type DealPriority,
  type PipelineStageId,
} from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Contact } from "@/types/contacts";

interface NewDealDialogProps {
  contacts: Contact[];
  defaultContactId?: string;
  defaultStageId?: PipelineStageId;
  trigger?: React.ReactNode;
}

export function NewDealDialog({
  contacts,
  defaultContactId,
  defaultStageId = "new",
  trigger,
}: NewDealDialogProps) {
  const { subAccountId, subAccount } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const stages = usePipelineStages();
  const [open, setOpen] = useState(false);
  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [stageId, setStageId] = useState<PipelineStageId>(defaultStageId);
  const [priority, setPriority] = useState<DealPriority>("medium");
  const [contactId, setContactId] = useState(defaultContactId ?? "");
  const [cfDefs, setCfDefs] = useState<CustomFieldDef[]>([]);
  const [cfValues, setCfValues] = useState<Record<string, CustomFieldValue>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setTitle("");
      setValue("");
      setCurrency("USD");
      setStageId(defaultStageId);
      setPriority("medium");
      setContactId(defaultContactId ?? "");
      setCfValues({});
      setErrors({});
    }
  }, [open, defaultContactId, defaultStageId]);

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

  // Territories — only needed to resolve the read-only "inherited from
  // contact" label, and only while the dialog is open + scoping is on.
  useEffect(() => {
    if (!open || !scopingOn || !subAccountId) {
      setTerritories([]);
      return;
    }
    const unsub = subscribeToTerritories(subAccountId, (list) =>
      setTerritories(list),
    );
    return () => unsub();
  }, [open, scopingOn, subAccountId]);

  const selectedContact = contacts.find((c) => c.id === contactId);

  const territoryNameById = new Map(territories.map((t) => [t.id, t.name]));
  const labelForTerritory = (id: string | null | undefined) =>
    !id || id === GLOBAL_TERRITORY_ID
      ? "Global"
      : (territoryNameById.get(id) ?? "Global");

  // A deal inherits its territory from the contact (the "account"), never
  // from whoever creates it — so this is display-only, even for admins.
  const territoryLabel = labelForTerritory(selectedContact?.territoryId);
  // Per-row territory chip in the contact picker — only when scoping is on.
  const contactTerritoryLabel = scopingOn
    ? (c: Contact) => labelForTerritory(c.territoryId)
    : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
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

    const payload: DealFormData = {
      title: title.trim(),
      value: Number(value) || 0,
      currency,
      contactId,
      stageId,
      priority,
      // Territory is owned by the contact (the account) — the deal
      // inherits it. No separate picker; reassignment happens by
      // re-tagging the contact.
      territoryId: selectedContact?.territoryId ?? null,
      customFields: cf.value,
    };
    setSaving(true);
    try {
      // Server route (not a direct Firestore write) so deal.created fires.
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subAccountId, ...payload }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't create deal. Try again.");
        return;
      }
      toast.success("Deal created");
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create deal. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {trigger ? (
        // span wrapper instead of <button> — callers pass interactive
        // elements like <Button>, and a button-inside-a-button is invalid
        // HTML (React's hydration check flags it). role/keys provide a11y.
        <span
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className="contents"
        >
          {trigger}
        </span>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New Deal
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New Deal</SheetTitle>
            <SheetDescription>
              Track an opportunity against a contact. Deals live in your
              pipeline.
            </SheetDescription>
          </SheetHeader>

          <form className="space-y-4 p-4 pt-0" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="deal-title">
                Deal title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="deal-title"
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
                <Label htmlFor="deal-value">Value</Label>
                <Input
                  id="deal-value"
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
                <Label htmlFor="deal-currency">Currency</Label>
                <select
                  id="deal-currency"
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
              <Label htmlFor="deal-stage">Stage</Label>
              <select
                id="deal-stage"
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
              <Label htmlFor="deal-priority">Priority</Label>
              <select
                id="deal-priority"
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
              <Label htmlFor="deal-contact">
                Contact <span className="text-destructive">*</span>
              </Label>
              <ContactPicker
                id="deal-contact"
                contacts={contacts}
                value={contactId}
                onChange={setContactId}
                title="Pick a contact"
                territoryLabel={contactTerritoryLabel}
              />
              {errors.contactId && (
                <p className="text-xs text-destructive">{errors.contactId}</p>
              )}
            </div>

            {scopingOn && selectedContact && (
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
                  idPrefix="deal-cf"
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
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create Deal"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
