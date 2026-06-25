"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSubAccount } from "@/context/sub-account-context";
import { TerritorySelectField } from "@/components/settings/territory-select-field";
import { CustomFieldInputs } from "@/components/custom-fields/custom-field-inputs";
import { subscribeToCustomFields } from "@/lib/firestore/custom-fields";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";
import type { CustomFieldDef, CustomFieldValue } from "@/types/custom-fields";
import type { Contact, ContactFormData, ContactSource } from "@/types/contacts";

const SOURCES: { value: ContactSource; label: string }[] = [
  { value: "", label: "—" },
  { value: "website-form", label: "Website Form" },
  { value: "web-chat", label: "Web Chat" },
  { value: "website", label: "Website (other)" },
  { value: "referral", label: "Referral" },
  { value: "ads", label: "Ads" },
  { value: "other", label: "Other" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactFormProps {
  initial?: Partial<Contact>;
  submitLabel?: string;
  onSubmit: (data: ContactFormData) => Promise<void>;
  onCancel?: () => void;
}

export function ContactForm({
  initial,
  submitLabel = "Save Contact",
  onSubmit,
  onCancel,
}: ContactFormProps) {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  // For existing contacts, only admins may reassign the territory.
  // For new contacts, any caller can pick (the rule is on update).
  const isEdit = !!initial?.id;
  const canEditTerritory = scopingOn && (!isEdit || isAdmin);

  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [source, setSource] = useState<ContactSource>(initial?.source ?? "");
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(", "));
  const [territoryId, setTerritoryId] = useState<string | null>(
    initial?.territoryId ?? null,
  );

  const [cfDefs, setCfDefs] = useState<CustomFieldDef[]>([]);
  const [cfValues, setCfValues] = useState<Record<string, CustomFieldValue>>(
    (initial?.customFields ?? {}) as Record<string, CustomFieldValue>,
  );

  // Live custom-field definitions for contacts in this sub-account.
  useEffect(() => {
    if (!subAccountId) return;
    const unsub = subscribeToCustomFields(
      subAccountId,
      "contact",
      setCfDefs,
      () => {},
    );
    return () => unsub();
  }, [subAccountId]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required";
    if (!email.trim()) next.email = "Email is required";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Validate + coerce custom-field values against the live definitions.
    const cf = validateCustomFieldValues(cfValues, cfDefs);
    if (!cf.ok) {
      toast.error(cf.error);
      return;
    }

    setSaving(true);
    try {
      const payload: ContactFormData = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        company: company.trim(),
        address: address.trim(),
        source,
        tags,
        customFields: cf.value,
      };
      // Only include territoryId when scoping is on AND (creating OR
      // admin editing). Rules also enforce this server-side.
      if (canEditTerritory) {
        payload.territoryId = territoryId;
      }
      await onSubmit(payload);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save contact. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="c-name">
          Full name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="c-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-email">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="c-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-phone">Phone</Label>
          <Input
            id="c-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+61 400 000 000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-company">Company</Label>
          <Input
            id="c-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Inc."
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-address">Address</Label>
        <Textarea
          id="c-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, City, State, Postal, Country"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Auto-populates on quotes and invoices billed to this contact.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-source">Source</Label>
        <select
          id="c-source"
          value={source}
          onChange={(e) => setSource(e.target.value as ContactSource)}
          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-tags">Tags</Label>
        <Input
          id="c-tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="lead, warm, 2026-q2"
        />
        <p className="text-xs text-muted-foreground">
          Separate tags with commas
        </p>
      </div>

      {/* Renders nothing when territory scoping is off. */}
      <TerritorySelectField
        id="c-territory"
        value={territoryId}
        onChange={setTerritoryId}
        disabled={!canEditTerritory}
        autoDefaultFromAssigned={!isEdit}
      />

      {/* Operator-defined custom fields (renders nothing when none defined). */}
      {cfDefs.length > 0 && (
        <div className="space-y-4 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground">
            Custom fields
          </p>
          <CustomFieldInputs
            idPrefix="c-cf"
            defs={cfDefs}
            values={cfValues}
            onChange={setCfValues}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={saving}
          >
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
