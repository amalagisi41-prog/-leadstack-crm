"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  AtSign,
  Building2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Hash,
  ListChecks,
  Phone as PhoneIcon,
  Plus,
  ShieldCheck,
  TextCursor,
  Trash2,
  Type,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToForm, updateForm } from "@/lib/firestore/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PIPELINE_STAGES, type PipelineStageId } from "@/types/deals";
import {
  defaultFormAppearance,
  defaultSmsConsentText,
  type FormAppearance,
  type FormField,
  type FormFieldType,
  type FormSettings,
  type LeadForm,
} from "@/types/forms";

/**
 * Headless HTML snippet — gives the developer a copy-pasteable unstyled
 * form + a tiny submit script that POSTs to the same /api/forms/[id]/submit
 * endpoint the iframe + hosted page use. Submissions create contacts and
 * fire automations identically; only the rendering surface changes.
 *
 * Input `name` attributes are the field's Firestore doc id. If the
 * developer wants to write their own form HTML, they can — just keep the
 * name attributes matching these ids.
 *
 * CORS is enabled on the submit route so this works from any origin.
 */
function buildHtmlSnippet(form: LeadForm, origin: string): string {
  const apiUrl = `${origin}/api/forms/${form.id}/submit`;
  const escAttr = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const escText = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const fieldsHtml = form.fields
    .map((f) => {
      const id = `ls-${f.id}`;
      const labelText = escText(f.label) + (f.required ? " *" : "");
      const placeholder = escAttr(f.placeholder ?? "");
      const required = f.required ? " required" : "";
      const common =
        `id="${id}" name="${escAttr(f.id)}"` +
        (placeholder ? ` placeholder="${placeholder}"` : "") +
        required;

      if (f.type === "textarea") {
        return [
          `  <label for="${id}">${labelText}</label>`,
          `  <textarea ${common} rows="4"></textarea>`,
        ].join("\n");
      }
      if (f.type === "select") {
        const opts = (f.options ?? [])
          .map(
            (o) =>
              `    <option value="${escAttr(o)}">${escText(o)}</option>`,
          )
          .join("\n");
        return [
          `  <label for="${id}">${labelText}</label>`,
          `  <select ${common}>`,
          `    <option value="">Select…</option>`,
          opts,
          `  </select>`,
        ]
          .filter(Boolean)
          .join("\n");
      }
      if (f.type === "sms_consent") {
        // Checkbox with value="true" so FormData yields "true" when ticked
        // and omits it when not — matching the submit route's `=== "true"`.
        const consent = escText(f.consentText?.trim() || "");
        return [
          `  <label for="${id}">`,
          `    <input type="checkbox" id="${id}" name="${escAttr(f.id)}" value="true"${required} />`,
          `    <span>${consent}</span>`,
          `  </label>`,
        ].join("\n");
      }
      const inputType =
        f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text";
      return [
        `  <label for="${id}">${labelText}</label>`,
        `  <input type="${inputType}" ${common} />`,
      ].join("\n");
    })
    .join("\n\n");

  return `<!-- LeadStack form. Style with your own CSS — every element is unstyled. -->
<!-- Submissions create contacts and fire automations in your workspace. -->
<form data-leadstack-form="${form.id}" novalidate>
${fieldsHtml}

  <button type="submit">Send message</button>
  <p data-leadstack-status hidden></p>
</form>

<script>
(function () {
  var form = document.querySelector('[data-leadstack-form="${form.id}"]');
  if (!form) return;
  var status = form.querySelector("[data-leadstack-status]");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var values = {};
    new FormData(form).forEach(function (v, k) { values[k] = String(v); });
    if (status) { status.hidden = false; status.textContent = "Sending…"; }
    fetch(${JSON.stringify(apiUrl)}, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: values })
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || "Submission failed");
        if (res.body.redirectUrl) { window.location.href = res.body.redirectUrl; return; }
        form.reset();
        if (status) { status.textContent = res.body.thankYouMessage || "Thanks!"; }
      })
      .catch(function (err) {
        if (status) { status.textContent = err.message || "Error"; }
      });
  });
})();
</script>`;
}

const FIELD_TYPES: {
  value: FormFieldType;
  label: string;
  icon: typeof Type;
  /** Static Tailwind classes — avoid dynamic concatenation so JIT keeps them. */
  tone: {
    border: string;
    iconBg: string;
    iconText: string;
  };
}[] = [
  {
    value: "text",
    label: "Short text",
    icon: Type,
    tone: {
      border: "border-slate-400/30 hover:border-slate-400/60",
      iconBg: "bg-slate-500/10",
      iconText: "text-slate-600 dark:text-slate-300",
    },
  },
  {
    value: "email",
    label: "Email",
    icon: AtSign,
    tone: {
      border: "border-blue-400/30 hover:border-blue-400/60",
      iconBg: "bg-blue-500/10",
      iconText: "text-blue-600 dark:text-blue-300",
    },
  },
  {
    value: "phone",
    label: "Phone",
    icon: PhoneIcon,
    tone: {
      border: "border-emerald-400/30 hover:border-emerald-400/60",
      iconBg: "bg-emerald-500/10",
      iconText: "text-emerald-600 dark:text-emerald-300",
    },
  },
  {
    value: "company",
    label: "Company",
    icon: Building2,
    tone: {
      border: "border-amber-400/30 hover:border-amber-400/60",
      iconBg: "bg-amber-500/10",
      iconText: "text-amber-600 dark:text-amber-300",
    },
  },
  {
    value: "textarea",
    label: "Long text",
    icon: TextCursor,
    tone: {
      border: "border-violet-400/30 hover:border-violet-400/60",
      iconBg: "bg-violet-500/10",
      iconText: "text-violet-600 dark:text-violet-300",
    },
  },
  {
    value: "select",
    label: "Dropdown",
    icon: ListChecks,
    tone: {
      border: "border-pink-400/30 hover:border-pink-400/60",
      iconBg: "bg-pink-500/10",
      iconText: "text-pink-600 dark:text-pink-300",
    },
  },
  {
    value: "sms_consent",
    label: "SMS consent",
    icon: ShieldCheck,
    tone: {
      border: "border-teal-400/30 hover:border-teal-400/60",
      iconBg: "bg-teal-500/10",
      iconText: "text-teal-600 dark:text-teal-300",
    },
  },
];

function typeMeta(value: FormFieldType) {
  return FIELD_TYPES.find((t) => t.value === value) ?? FIELD_TYPES[0];
}

const MAP_OPTIONS: { value: FormField["mapsTo"]; label: string }[] = [
  { value: null, label: "Don't map (store only)" },
  { value: "name", label: "Contact name" },
  { value: "email", label: "Contact email" },
  { value: "phone", label: "Contact phone" },
  { value: "company", label: "Company" },
  { value: "notes", label: "Initial note" },
];

const DEFAULTS_BY_TYPE: Record<
  FormFieldType,
  { label: string; placeholder: string; mapsTo: FormField["mapsTo"] }
> = {
  text: { label: "Text field", placeholder: "", mapsTo: null },
  email: { label: "Email", placeholder: "jane@example.com", mapsTo: "email" },
  phone: { label: "Phone", placeholder: "+1 555 000 0000", mapsTo: "phone" },
  company: { label: "Company", placeholder: "Acme Inc.", mapsTo: "company" },
  textarea: { label: "Message", placeholder: "", mapsTo: "notes" },
  select: { label: "Dropdown", placeholder: "", mapsTo: null },
  sms_consent: { label: "SMS consent", placeholder: "", mapsTo: null },
};

function newField(type: FormFieldType = "text"): FormField {
  const d = DEFAULTS_BY_TYPE[type];
  return {
    ...(type === "sms_consent"
      ? { consentText: defaultSmsConsentText() }
      : {}),
    id: `f_${Math.random().toString(36).slice(2, 9)}`,
    type,
    label: d.label,
    placeholder: d.placeholder,
    required: false,
    options: [],
    mapsTo: d.mapsTo,
  };
}

export default function FormBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, loading: authLoading } = useAuth();
  const { saPath, subAccount } = useSubAccount();
  const [form, setForm] = useState<LeadForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedTag, setCopiedTag] = useState("");

  useEffect(() => {
    if (authLoading || !user || !id) return;
    setLoading(true);
    const unsub = subscribeToForm(id, (f) => {
      setForm(f);
      setLoading(false);
    });
    return () => unsub();
  }, [id, user, authLoading]);

  if (loading) return <BuilderSkeleton />;
  if (!form) return <NotFound />;

  async function save(patch: Partial<LeadForm>) {
    if (!form) return;
    setSaving(true);
    try {
      await updateForm(form.id, patch);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(fid: string, patch: Partial<FormField>) {
    const next = form!.fields.map((f) =>
      f.id === fid ? { ...f, ...patch } : f,
    );
    save({ fields: next });
  }

  function addField(type: FormFieldType = "text") {
    const field = newField(type);
    // Seed the consent disclosure with the sub-account's business name so the
    // operator starts from compliant, branded copy (still fully editable).
    if (type === "sms_consent") {
      field.consentText = defaultSmsConsentText(subAccount?.name);
    }
    save({ fields: [...form!.fields, field] });
  }

  function removeField(fid: string) {
    save({ fields: form!.fields.filter((f) => f.id !== fid) });
  }

  function moveField(fid: string, dir: -1 | 1) {
    const idx = form!.fields.findIndex((f) => f.id === fid);
    if (idx < 0) return;
    const next = [...form!.fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    save({ fields: next });
  }

  function updateSettings(patch: Partial<FormSettings>) {
    save({ settings: { ...form!.settings, ...patch } });
  }

  function updateAppearance(patch: Partial<FormAppearance>) {
    const current = form!.settings.appearance ?? defaultFormAppearance();
    updateSettings({ appearance: { ...current, ...patch } });
  }

  function buildPublicUrl(forEmbed: boolean) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const a = form!.settings.appearance ?? defaultFormAppearance();
    const params = new URLSearchParams();
    if (forEmbed) {
      params.set("embed", "1");
      params.set("theme", a.theme);
      params.set("accent", a.accent);
      if (a.hideTitle) params.set("title", "0");
    }
    const qs = params.toString();
    return `${origin}/f/${form!.id}${qs ? `?${qs}` : ""}`;
  }

  function copyTag(kind: "link" | "script" | "html") {
    const text =
      kind === "link"
        ? buildPublicUrl(false)
        : kind === "script"
          ? `<iframe src="${buildPublicUrl(true)}" width="100%" height="600" style="border:0;background:transparent" allowtransparency="true"></iframe>`
          : buildHtmlSnippet(form!, typeof window !== "undefined" ? window.location.origin : "");
    navigator.clipboard.writeText(text);
    setCopiedTag(kind);
    toast.success(
      kind === "link"
        ? "Link copied"
        : kind === "script"
          ? "Embed snippet copied"
          : "HTML snippet copied",
    );
    setTimeout(() => setCopiedTag(""), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={saPath("/forms")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to forms
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <Input
              value={form.name}
              onChange={(e) => save({ name: e.target.value })}
              className="h-auto border-none bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
            />
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                form.enabled
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {form.enabled ? "Live" : "Paused"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {saving ? "Saving…" : "All changes saved"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => save({ enabled: !form.enabled })}
          >
            {form.enabled ? "Pause form" : "Resume form"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => copyTag("link")}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            {copiedTag === "link" ? "Copied" : "Copy link"}
          </Button>
          <Button
            size="sm"
            render={<a href={`/f/${form.id}`} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            Preview
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Fields column — visually on the right at lg+, source order kept
            for sensible mobile stacking. */}
        <section className="rounded-2xl border bg-card p-5 lg:order-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Fields</h2>
              <p className="text-[11px] text-muted-foreground">
                {form.fields.length} total · drag order with the arrows
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm">
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add field
                    <ChevronDown className="ml-0.5 h-3 w-3 opacity-70" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-44">
                {FIELD_TYPES.map((t) => (
                  <DropdownMenuItem
                    key={t.value}
                    onClick={() => addField(t.value)}
                  >
                    <t.icon className="mr-2 h-3.5 w-3.5" />
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="space-y-1.5">
            {form.fields.map((f, i) => {
              const meta = typeMeta(f.type);
              const Icon = meta.icon;
              return (
                <div
                  key={f.id}
                  className={`group/field overflow-hidden rounded-lg border bg-background transition-colors ${meta.tone.border}`}
                >
                  {/* Header row */}
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <div className="flex flex-col gap-px">
                      <button
                        type="button"
                        onClick={() => moveField(f.id, -1)}
                        disabled={i === 0}
                        className="rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-20"
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(f.id, 1)}
                        disabled={i === form.fields.length - 1}
                        className="rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-20"
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <span
                      className={`ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${meta.tone.iconBg} ${meta.tone.iconText}`}
                      title={meta.label}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <Input
                      value={f.label}
                      onChange={(e) =>
                        updateField(f.id, { label: e.target.value })
                      }
                      placeholder="Field label"
                      className="h-7 flex-1 border-none bg-transparent px-1.5 text-sm font-medium shadow-none focus-visible:ring-0"
                    />
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted">
                      <Checkbox
                        checked={f.required}
                        onCheckedChange={(v) =>
                          updateField(f.id, { required: !!v })
                        }
                      />
                      Required
                    </label>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => removeField(f.id)}
                      aria-label="Remove field"
                      className="text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover/field:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Compact meta strip — mapsTo + placeholder are irrelevant
                      for the consent checkbox, so it gets its own editor below. */}
                  {f.type !== "sms_consent" && (
                  <div className="grid grid-cols-1 gap-1.5 border-t bg-muted/20 px-2 py-1.5 text-xs sm:grid-cols-[110px_180px_1fr]">
                    <select
                      value={f.type}
                      onChange={(e) =>
                        updateField(f.id, {
                          type: e.target.value as FormFieldType,
                        })
                      }
                      aria-label="Field type"
                      className="h-7 rounded-md border border-input bg-transparent px-1.5 text-[11px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option
                          key={t.value}
                          value={t.value}
                          className="bg-background text-foreground"
                        >
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.mapsTo ?? ""}
                      onChange={(e) =>
                        updateField(f.id, {
                          mapsTo:
                            (e.target.value || null) as FormField["mapsTo"],
                        })
                      }
                      aria-label="Maps to contact"
                      className="h-7 rounded-md border border-input bg-transparent px-1.5 text-[11px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                    >
                      {MAP_OPTIONS.map((o) => (
                        <option
                          key={o.label}
                          value={o.value ?? ""}
                          className="bg-background text-foreground"
                        >
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={f.placeholder}
                      onChange={(e) =>
                        updateField(f.id, { placeholder: e.target.value })
                      }
                      placeholder="Placeholder (optional)"
                      className="h-7 px-2 text-[11px]"
                    />
                  </div>
                  )}

                  {f.type === "sms_consent" && (
                    <div className="space-y-1 border-t bg-muted/20 px-2 py-1.5">
                      <Label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <ShieldCheck className="h-3 w-3" /> Consent text (shown
                        beside the checkbox)
                      </Label>
                      <Textarea
                        rows={3}
                        value={f.consentText ?? ""}
                        onChange={(e) =>
                          updateField(f.id, { consentText: e.target.value })
                        }
                        className="min-h-0 text-xs"
                        placeholder={defaultSmsConsentText()}
                      />
                      <p className="text-[10px] leading-snug text-muted-foreground">
                        For A2P 10DLC compliance the text must name your
                        business and include message frequency, &ldquo;message
                        &amp; data rates may apply,&rdquo; and STOP/HELP
                        instructions. The box stays unticked by default — tick
                        &ldquo;Required&rdquo; only if SMS consent is mandatory
                        to submit. Add your Privacy Policy + Terms links on the
                        surrounding page.
                      </p>
                    </div>
                  )}

                  {f.type === "select" && (
                    <div className="space-y-1 border-t bg-muted/20 px-2 py-1.5">
                      <Label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <Hash className="h-3 w-3" /> Options · one per line
                      </Label>
                      <Textarea
                        rows={3}
                        value={f.options.join("\n")}
                        onChange={(e) =>
                          updateField(f.id, {
                            options: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        className="min-h-0 text-xs"
                        placeholder={"Low budget\nMedium\nEnterprise"}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {form.fields.length === 0 && (
              <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                No fields yet. Use <span className="font-medium">Add field</span> above to get started.
              </div>
            )}
          </div>
        </section>

        {/* Settings column — visually on the left at lg+. */}
        <aside className="space-y-4 lg:order-1">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">On submission</h2>
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <Label>Land new leads in pipeline stage</Label>
                <select
                  value={form.settings.pipelineStageId ?? ""}
                  onChange={(e) =>
                    updateSettings({
                      pipelineStageId:
                        (e.target.value || null) as PipelineStageId | null,
                    })
                  }
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                >
                  <option value="" className="bg-background text-foreground">
                    — None (contact only)
                  </option>
                  {PIPELINE_STAGES.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      className="bg-background text-foreground"
                    >
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Auto-tags (comma separated)</Label>
                <Input
                  value={form.settings.autoTags.join(", ")}
                  onChange={(e) =>
                    updateSettings({
                      autoTags: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.settings.createDeal}
                  onCheckedChange={(v) =>
                    updateSettings({ createDeal: !!v })
                  }
                />
                <span>Also open a deal</span>
              </div>
              {form.settings.createDeal && (
                <div className="space-y-2 pl-6">
                  <div className="space-y-1.5">
                    <Label>Deal title template</Label>
                    <Input
                      value={form.settings.dealTitleTemplate}
                      onChange={(e) =>
                        updateSettings({
                          dealTitleTemplate: e.target.value,
                        })
                      }
                      className="h-8 text-sm"
                      placeholder="New lead — {name}"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Use <code>{`{name}`}</code>, <code>{`{email}`}</code>,{" "}
                      <code>{`{company}`}</code> as placeholders.
                    </p>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="space-y-1.5">
                      <Label>Default value</Label>
                      <Input
                        type="number"
                        value={form.settings.dealValue}
                        onChange={(e) =>
                          updateSettings({
                            dealValue: Number(e.target.value) || 0,
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Currency</Label>
                      <select
                        value={form.settings.dealCurrency}
                        onChange={(e) =>
                          updateSettings({ dealCurrency: e.target.value })
                        }
                        className="flex h-8 w-24 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                      >
                        {["USD", "AUD", "EUR", "GBP", "CAD"].map((c) => (
                          <option
                            key={c}
                            value={c}
                            className="bg-background text-foreground"
                          >
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">After submit</h2>
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <Label>Thank-you message</Label>
                <Textarea
                  rows={3}
                  value={form.settings.thankYouMessage}
                  onChange={(e) =>
                    updateSettings({ thankYouMessage: e.target.value })
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Redirect URL (optional)</Label>
                <Input
                  value={form.settings.redirectUrl}
                  onChange={(e) =>
                    updateSettings({ redirectUrl: e.target.value })
                  }
                  placeholder="https://…"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </section>

          <EmbedAppearanceSection
            appearance={form.settings.appearance ?? defaultFormAppearance()}
            onChange={updateAppearance}
            previewUrl={buildPublicUrl(true)}
          />

          <section className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-5">
            <h2 className="mb-1 text-sm font-semibold">Share</h2>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Three ways to collect submissions. All flow to the same contact +
              automation pipeline.
            </p>
            <div className="space-y-2 text-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTag("link")}
                className="w-full justify-start"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copiedTag === "link" ? "Link copied" : "Copy public link"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTag("script")}
                className="w-full justify-start"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copiedTag === "script" ? "Embed copied" : "Copy iframe embed"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTag("html")}
                className="w-full justify-start"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copiedTag === "html" ? "HTML copied" : "Copy HTML snippet"}
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">HTML snippet</strong> = an
              unstyled form + tiny script your developer drops into any site.
              Style it with your own CSS; submissions still create contacts and
              fire automations here.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function BuilderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-64 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="h-96 animate-pulse rounded-2xl border bg-muted/30" />
        <div className="h-96 animate-pulse rounded-2xl border bg-muted/30" />
      </div>
    </div>
  );
}

function NotFound() {
  const { saPath } = useSubAccount();
  return (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <h2 className="text-lg font-semibold">Form not found</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        It may have been deleted.
      </p>
      <Button render={<Link href={saPath("/forms")} />} className="mt-6">
        Back to forms
      </Button>
    </div>
  );
}

const ACCENT_PRESETS: { label: string; value: string }[] = [
  { label: "Violet", value: "#7c3aed" },
  { label: "Indigo", value: "#4f46e5" },
  { label: "Blue", value: "#2563eb" },
  { label: "Emerald", value: "#10b981" },
  { label: "Rose", value: "#e11d48" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Slate", value: "#475569" },
];

function EmbedAppearanceSection({
  appearance,
  onChange,
  previewUrl,
}: {
  appearance: FormAppearance;
  onChange: (patch: Partial<FormAppearance>) => void;
  previewUrl: string;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold">Embed appearance</h2>
      <p className="mb-3 text-[11px] text-muted-foreground">
        How the form looks when embedded as an iframe. The standalone link
        ignores these — they only kick in for the iframe snippet below.
      </p>
      <div className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <Label>Theme</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ theme: t })}
                className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                  appearance.theme === t
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Accent colour</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={appearance.accent}
              onChange={(e) => onChange({ accent: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
              aria-label="Pick accent colour"
            />
            <Input
              value={appearance.accent}
              onChange={(e) => onChange({ accent: e.target.value })}
              className="h-8 flex-1 font-mono text-xs"
              placeholder="#7c3aed"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ accent: p.value })}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors ${
                  appearance.accent.toLowerCase() === p.value
                    ? "border-foreground/40"
                    : "border-input hover:bg-muted/50"
                }`}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: p.value }}
                />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 pt-1">
          <Checkbox
            checked={appearance.hideChrome}
            onCheckedChange={(v) => onChange({ hideChrome: !!v })}
          />
          <span className="text-xs">Hide LeadStack header + footer</span>
        </label>

        <label className="flex items-center gap-2">
          <Checkbox
            checked={appearance.hideTitle}
            onCheckedChange={(v) => onChange({ hideTitle: !!v })}
          />
          <span className="text-xs">
            Hide form title (use when the host page already has a heading)
          </span>
        </label>

        <div className="rounded-lg border border-dashed bg-muted/30 p-3">
          <p className="text-[11px] text-muted-foreground">Preview</p>
          <iframe
            key={`${appearance.theme}-${appearance.accent}-${appearance.hideChrome}`}
            src={previewUrl}
            className="mt-2 h-72 w-full rounded-md border bg-transparent"
            style={{ background: "transparent" }}
            title="Form preview"
          />
        </div>
      </div>
    </section>
  );
}
