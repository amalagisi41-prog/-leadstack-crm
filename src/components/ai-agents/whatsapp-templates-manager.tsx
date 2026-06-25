"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { toast } from "sonner";
import { Loader2, Lock, Plus, Send, Sparkles, Trash2, Pencil } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseBodyPositions } from "@/lib/comms/whatsapp/template-validation";
import {
  WHATSAPP_STARTER_TEMPLATES,
  type WhatsappStarterTemplate,
} from "@/lib/comms/whatsapp/starter-templates";
import {
  WHATSAPP_VARIABLE_MERGE_TAGS,
  type WhatsappTemplateCategory,
  type WhatsappTemplateDoc,
} from "@/types/whatsapp-templates";

type VarForm = {
  label: string;
  sampleValue: string;
  source: "manual" | "merge_tag";
  mergeTag: string;
};

const CATEGORY_OPTIONS: { value: WhatsappTemplateCategory; label: string }[] = [
  { value: "UTILITY", label: "Utility (transactional)" },
  { value: "MARKETING", label: "Marketing (promotional)" },
];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitting: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  paused: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  disabled: "bg-muted text-muted-foreground",
};

export function WhatsappTemplatesManager() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [templates, setTemplates] = useState<
    (WhatsappTemplateDoc & { id: string })[]
  >([]);
  const [hydrated, setHydrated] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const agencyEnabled = subAccount?.whatsappEnabledByAgency === true;
  const senderConfigured = !!subAccount?.twilioConfig?.whatsappFromNumber;

  // Builder form state.
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState<WhatsappTemplateCategory>("UTILITY");
  const [language, setLanguage] = useState("en");
  const [body, setBody] = useState("");
  const [varForms, setVarForms] = useState<Record<number, VarForm>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin || !agencyEnabled) return;
    const db = getFirebaseDb();
    const q = query(
      collection(db, `subAccounts/${subAccountId}/whatsappTemplates`),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTemplates(
          snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as WhatsappTemplateDoc & { id: string },
          ),
        );
        setHydrated(true);
      },
      () => setHydrated(true),
    );
    return () => unsub();
  }, [subAccountId, isAdmin, agencyEnabled]);

  const positions = useMemo(() => parseBodyPositions(body), [body]);

  // Keep varForms in sync with the positions detected in the body.
  useEffect(() => {
    setVarForms((prev) => {
      const next: Record<number, VarForm> = {};
      for (const p of positions) {
        next[p] = prev[p] ?? {
          label: `Value ${p}`,
          sampleValue: "",
          source: "manual",
          mergeTag: "",
        };
      }
      return next;
    });
  }, [positions]);

  const resetBuilder = useCallback(() => {
    setDisplayName("");
    setCategory("UTILITY");
    setLanguage("en");
    setBody("");
    setVarForms({});
    setEditingId(null);
    setBuilderOpen(false);
  }, []);

  function loadStarter(s: WhatsappStarterTemplate) {
    setEditingId(null);
    setDisplayName(s.displayName);
    setCategory(s.category === "AUTHENTICATION" ? "UTILITY" : s.category);
    setLanguage(s.language);
    setBody(s.body);
    const vf: Record<number, VarForm> = {};
    for (const v of s.variables) {
      vf[v.position] = {
        label: v.label,
        sampleValue: v.sampleValue,
        source: v.source,
        mergeTag: v.mergeTag ?? "",
      };
    }
    setVarForms(vf);
    setBuilderOpen(true);
  }

  function loadForEdit(t: WhatsappTemplateDoc & { id: string }) {
    setEditingId(t.id);
    setDisplayName(t.displayName);
    setCategory(t.category === "AUTHENTICATION" ? "UTILITY" : t.category);
    setLanguage(t.language);
    setBody(t.body);
    const vf: Record<number, VarForm> = {};
    for (const v of t.variables) {
      vf[v.position] = {
        label: v.label,
        sampleValue: v.sampleValue,
        source: v.source,
        mergeTag: v.mergeTag ?? "",
      };
    }
    setVarForms(vf);
    setBuilderOpen(true);
  }

  function buildVariablesPayload() {
    return positions.map((p) => ({
      position: p,
      label: varForms[p]?.label ?? `Value ${p}`,
      sampleValue: varForms[p]?.sampleValue ?? "",
      source: varForms[p]?.source ?? "manual",
      mergeTag:
        varForms[p]?.source === "merge_tag" ? varForms[p]?.mergeTag || null : null,
    }));
  }

  async function handleSave(submitAfter: boolean) {
    setSaving(true);
    try {
      const payload = {
        displayName: displayName.trim(),
        category,
        language: language.trim() || "en",
        body: body.trim(),
        variables: buildVariablesPayload(),
      };
      const url = editingId
        ? `/api/sub-accounts/${subAccountId}/whatsapp-templates/${editingId}`
        : `/api/sub-accounts/${subAccountId}/whatsapp-templates`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        template?: { id: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't save template.");
      }
      const id = editingId ?? data.template?.id;
      if (submitAfter && id) {
        await submitTemplate(id);
      } else {
        toast.success("Template saved as draft.");
      }
      resetBuilder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function submitTemplate(id: string) {
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/whatsapp-templates/${id}/submit`,
      { method: "POST" },
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Submission failed.");
    }
    toast.success("Submitted to Meta for approval — status will update here.");
  }

  async function handleSubmitExisting(id: string) {
    try {
      await submitTemplate(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/whatsapp-templates/${id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't delete.");
      toast.success("Template deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
    }
  }

  if (!isAdmin) return null;

  if (!agencyEnabled) {
    return (
      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Lock className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">WhatsApp templates</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              WhatsApp is locked for this sub-account. Ask your agency owner to
              enable it from the sub-account&apos;s Manage panel.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const canEdit = (s: string) => ["draft", "rejected", "failed"].includes(s);
  const canSubmit = (s: string) => ["draft", "rejected", "failed"].includes(s);
  const canDelete = (s: string) => s !== "pending" && s !== "approved";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          WhatsApp templates
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pre-approved messages for starting or re-opening WhatsApp
          conversations outside the 24-hour window. Submitted to Meta for
          approval via Twilio — approval usually takes minutes.
        </p>
      </header>

      {!senderConfigured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-400">
          You can draft templates now, but submitting needs a WhatsApp sender —
          add one under{" "}
          <Link
            href={`/sa/${subAccountId}/dashboard/settings`}
            className="underline-offset-2 hover:underline"
          >
            Settings → SMS
          </Link>
          .
        </div>
      )}

      {builderOpen ? (
        <section className="rounded-2xl border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {editingId ? "Edit template" : "New template"}
            </h2>
            <Button variant="ghost" size="sm" onClick={resetBuilder} disabled={saving}>
              Cancel
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Booking confirmation"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-cat">Category</Label>
              <select
                id="tpl-cat"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as WhatsappTemplateCategory)
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">Message body</Label>
            <Textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Hi {{1}}, your booking with {{2}} is confirmed for {{3}}."
            />
            <p className="text-[11px] text-muted-foreground">
              Use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>… for variables.
              WhatsApp formatting: <code>*bold*</code>, <code>_italic_</code>.
            </p>
          </div>

          {positions.length > 0 && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <p className="text-sm font-medium">Variables</p>
              {positions.map((p) => {
                const vf = varForms[p];
                if (!vf) return null;
                return (
                  <div
                    key={p}
                    className="grid items-center gap-2 sm:grid-cols-[auto_1fr_1fr_1fr]"
                  >
                    <span className="text-xs font-mono text-muted-foreground">{`{{${p}}}`}</span>
                    <Input
                      value={vf.label}
                      onChange={(e) =>
                        setVarForms((prev) => ({
                          ...prev,
                          [p]: { ...prev[p]!, label: e.target.value },
                        }))
                      }
                      placeholder="Label"
                    />
                    <select
                      value={vf.source === "merge_tag" ? vf.mergeTag : "__manual"}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVarForms((prev) => ({
                          ...prev,
                          [p]:
                            val === "__manual"
                              ? { ...prev[p]!, source: "manual", mergeTag: "" }
                              : { ...prev[p]!, source: "merge_tag", mergeTag: val },
                        }));
                      }}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="__manual">Fill in when sending</option>
                      {WHATSAPP_VARIABLE_MERGE_TAGS.map((t) => (
                        <option key={t.tag} value={t.tag}>
                          {t.description}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={vf.sampleValue}
                      onChange={(e) =>
                        setVarForms((prev) => ({
                          ...prev,
                          [p]: { ...prev[p]!, sampleValue: e.target.value },
                        }))
                      }
                      placeholder="Sample (for review)"
                    />
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">
                Sample values are shown to Meta&apos;s reviewer. Variables mapped
                to a field auto-fill from the contact; others are typed when you
                send.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={saving || !displayName.trim() || !body.trim()}
            >
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Save draft
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={
                saving || !displayName.trim() || !body.trim() || !senderConfigured
              }
            >
              {saving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Save &amp; submit
            </Button>
          </div>
        </section>
      ) : (
        <>
          {/* Gallery */}
          <section className="rounded-2xl border bg-card p-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <h2 className="text-sm font-semibold">Start from a template</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {WHATSAPP_STARTER_TEMPLATES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => loadStarter(s)}
                  className="rounded-xl border bg-background p-3 text-left transition hover:border-violet-500/50 hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{s.displayName}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                        s.category === "MARKETING"
                          ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {s.category}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {s.description}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    ↳ {s.mapsTo}
                  </p>
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetBuilder();
                  setBuilderOpen(true);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Start from scratch
              </Button>
            </div>
          </section>

          {/* Existing templates */}
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="mb-3 text-sm font-semibold">Your templates</h2>
            {!hydrated ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No templates yet. Pick a starter above to create your first.
              </p>
            ) : (
              <ul className="divide-y">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {t.displayName}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                            STATUS_STYLES[t.status] ?? "bg-muted"
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.body}
                      </p>
                      {t.status === "rejected" && t.rejectionReason && (
                        <p className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                          Rejected: {t.rejectionReason}
                        </p>
                      )}
                      {t.status === "failed" && t.rejectionReason && (
                        <p className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                          {t.rejectionReason}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {canSubmit(t.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSubmitExisting(t.id)}
                          disabled={!senderConfigured}
                        >
                          <Send className="mr-1 h-3 w-3" />
                          Submit
                        </Button>
                      )}
                      {canEdit(t.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => loadForEdit(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete(t.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
