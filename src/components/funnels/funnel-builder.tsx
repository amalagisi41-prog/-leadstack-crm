"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Lightbulb,
  Loader2,
  Lock,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { FunnelRenderer } from "./funnel-renderer";
import { FUNNEL_GOALS, FUNNEL_STEPS, getFunnelGoal } from "@/lib/funnels/catalog";
import type {
  FunnelContent,
  FunnelDoc,
  FunnelGoalId,
} from "@/types/funnel";

/**
 * The Sales Funnel builder — a guided, jargon-free wizard.
 *
 * Built for agents who've never heard the word "funnel." Every step opens
 * with a plain-language teaching note (from FUNNEL_STEPS), pre-fills real
 * copy the agent edits instead of a blank box, and shows a live preview of
 * the exact page their leads will see.
 */

// The in-wizard steps (skip step 0 "goal" — that's the create screen).
const WIZARD_STEPS = FUNNEL_STEPS.slice(1);

export function FunnelsApp() {
  const { subAccountId, subAccount } = useSubAccount();
  const gateOpen = subAccount?.websiteStudioEnabledByAgency === true;

  const [loading, setLoading] = useState(true);
  const [funnels, setFunnels] = useState<FunnelDoc[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/funnels`);
      const data = (await res.json()) as { funnels?: FunnelDoc[] };
      setFunnels(data.funnels ?? []);
    } finally {
      setLoading(false);
    }
  }, [subAccountId]);

  useEffect(() => {
    if (subAccount && !gateOpen) {
      setLoading(false);
      return;
    }
    if (!gateOpen) return;
    void load();
  }, [gateOpen, subAccount, load]);

  const editing = useMemo(
    () => funnels.find((f) => f.id === editingId) ?? null,
    [funnels, editingId],
  );

  async function createFunnel(goal: FunnelGoalId) {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/funnels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const data = (await res.json()) as { funnel?: FunnelDoc; error?: string };
      if (!res.ok || !data.funnel) throw new Error(data.error ?? "Couldn't create.");
      setFunnels((prev) => [data.funnel!, ...prev]);
      setEditingId(data.funnel.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create funnel.");
    } finally {
      setCreating(false);
    }
  }

  function onSaved(updated: FunnelDoc) {
    setFunnels((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }

  async function deleteFunnel(id: string) {
    if (!confirm("Delete this funnel? Its shareable link will stop working.")) return;
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/funnels/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setFunnels((prev) => prev.filter((f) => f.id !== id));
      if (editingId === id) setEditingId(null);
      toast.success("Funnel deleted.");
    } catch {
      toast.error("Couldn't delete funnel.");
    }
  }

  // ---- Gated ----------------------------------------------------------
  if (subAccount && !gateOpen) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold">Sales Funnels are a premium add-on</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Build simple, high-converting lead-capture pages in minutes — part of
          Website Studio. Ask your agency to enable it for your account.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading funnels…
      </div>
    );
  }

  // ---- Editing one funnel --------------------------------------------
  if (editing) {
    return (
      <FunnelWizard
        key={editing.id}
        funnel={editing}
        subAccountId={subAccountId}
        onBack={() => setEditingId(null)}
        onSaved={onSaved}
      />
    );
  }

  // ---- List + create --------------------------------------------------
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Funnels</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A funnel is one simple web page with a single job: turn a visitor
          into a lead. Pick a goal, edit a few lines, and publish a link you can
          drop into texts, emails, your social bio, or ads. Every submission
          becomes a contact and starts your follow-up automatically.
        </p>
      </div>

      {funnels.length > 0 ? (
        <div className="space-y-2">
          {funnels.map((f) => (
            <FunnelRow
              key={f.id}
              funnel={f}
              subAccountId={subAccountId}
              onEdit={() => setEditingId(f.id)}
              onDelete={() => deleteFunnel(f.id)}
            />
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="mb-1 text-sm font-semibold">
          {funnels.length > 0 ? "Start another funnel" : "Create your first funnel"}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {FUNNEL_STEPS[0].teach}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FUNNEL_GOALS.map((g) => (
            <button
              key={g.id}
              disabled={creating}
              onClick={() => createFunnel(g.id)}
              className="group flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-[#1b3d7a] hover:bg-muted/40 disabled:opacity-60"
            >
              <span className="text-2xl">{g.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{g.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {g.plain}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FunnelRow({
  funnel,
  subAccountId,
  onEdit,
  onDelete,
}: {
  funnel: FunnelDoc;
  subAccountId: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const goal = getFunnelGoal(funnel.content.goal);
  const liveUrl = `/l/${subAccountId}/${funnel.slug}`;
  const published = funnel.status === "published";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-xl">{goal.emoji}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{funnel.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                published
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {published ? "Live" : "Draft"}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {funnel.submissionCount} lead{funnel.submissionCount === 1 ? "" : "s"} ·{" "}
            {goal.label}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {published ? (
          <Button
            variant="outline"
            size="sm"
            render={<a href={liveUrl} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" /> View
          </Button>
        ) : null}
        <Button size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

// ======================================================================
// The step-by-step wizard for one funnel.
// ======================================================================

function FunnelWizard({
  funnel,
  subAccountId,
  onBack,
  onSaved,
}: {
  funnel: FunnelDoc;
  subAccountId: string;
  onBack: () => void;
  onSaved: (f: FunnelDoc) => void;
}) {
  const [step, setStep] = useState(0);
  const [content, setContent] = useState<FunnelContent>(funnel.content);
  const [name, setName] = useState(funnel.name);
  const [slug, setSlug] = useState(funnel.slug);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState(funnel.status);

  const goal = getFunnelGoal(content.goal);
  const stepDef = WIZARD_STEPS[step];
  const isLast = step === WIZARD_STEPS.length - 1;
  const liveUrl = `/l/${subAccountId}/${slug}`;

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/funnels/${funnel.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        funnel?: FunnelDoc;
        error?: string;
      };
      if (!res.ok || !data.funnel) throw new Error(data.error ?? "Couldn't save.");
      onSaved(data.funnel);
      return data.funnel;
    },
    [subAccountId, funnel.id, onSaved],
  );

  // Autosave the current content when advancing between steps.
  async function saveCurrent() {
    setSaving(true);
    try {
      await patch({ content, name, slug });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    try {
      await saveCurrent();
      if (!isLast) setStep((s) => s + 1);
    } catch {
      /* toast already shown */
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const updated = await patch({ content, name, slug, status: "published" });
      setStatus(updated.status);
      toast.success("Your funnel is live! Share the link anywhere.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't publish.");
    } finally {
      setPublishing(false);
    }
  }

  function set<K extends keyof FunnelContent>(key: K, value: FunnelContent[K]) {
    setContent((c) => ({ ...c, [key]: value }));
  }

  function setBenefit(i: number, value: string) {
    setContent((c) => {
      const benefits = [...c.benefits];
      benefits[i] = value;
      return { ...c, benefits };
    });
  }

  function addBenefit() {
    setContent((c) => ({ ...c, benefits: [...c.benefits, ""] }));
  }

  function removeBenefit(i: number) {
    setContent((c) => ({
      ...c,
      benefits: c.benefits.filter((_, idx) => idx !== i),
    }));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to funnels">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">{goal.emoji}</span>
              <h1 className="text-lg font-bold tracking-tight">{name}</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Step {step + 1} of {WIZARD_STEPS.length} · {stepDef.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === "published" ? (
            <Button
              variant="outline"
              size="sm"
              render={<a href={liveUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> View live
            </Button>
          ) : null}
          <Button size="sm" onClick={publish} disabled={publishing || saving}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            {publishing
              ? "Publishing…"
              : status === "published"
                ? "Re-publish"
                : "Publish"}
          </Button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-1.5">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStep(i)}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-[#1b3d7a]" : "bg-muted"
            }`}
            aria-label={s.title}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Left: teach + fields */}
        <div className="space-y-4">
          {/* Teaching note */}
          <div className="flex gap-3 rounded-xl border border-blue-200/60 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <p className="text-sm text-blue-900/80 dark:text-blue-100/80">
              {stepDef.teach}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{stepDef.title}</h2>

            {stepDef.key === "headline" ? (
              <div className="space-y-4">
                <Field label="Headline (the big promise)">
                  <textarea
                    value={content.headline}
                    onChange={(e) => set("headline", e.target.value)}
                    rows={2}
                    className={inputCls}
                    placeholder={goal.starter.headline}
                  />
                </Field>
                <Field label="Supporting line">
                  <textarea
                    value={content.subhead}
                    onChange={(e) => set("subhead", e.target.value)}
                    rows={2}
                    className={inputCls}
                    placeholder={goal.starter.subhead}
                  />
                </Field>
              </div>
            ) : null}

            {stepDef.key === "benefits" ? (
              <div className="space-y-2">
                {content.benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={b}
                      onChange={(e) => setBenefit(i, e.target.value)}
                      className={inputCls}
                      placeholder="e.g. No cost and no pressure to list"
                    />
                    <button
                      onClick={() => removeBenefit(i)}
                      className="shrink-0 text-muted-foreground hover:text-red-500"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {content.benefits.length < 6 ? (
                  <button
                    onClick={addBenefit}
                    className="flex items-center gap-1 text-xs font-medium text-[#1b3d7a] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add a benefit
                  </button>
                ) : null}
              </div>
            ) : null}

            {stepDef.key === "form" ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Name is always collected. Turn on what you need to follow up —
                  asking for less gets you more leads.
                </p>
                <ToggleRow
                  label="Collect email address"
                  hint="Best for guides, listing alerts, and email follow-up."
                  checked={content.collectEmail}
                  onChange={(v) => set("collectEmail", v)}
                />
                <ToggleRow
                  label="Collect phone number"
                  hint="Best when you want to call or text the lead fast."
                  checked={content.collectPhone}
                  onChange={(v) => set("collectPhone", v)}
                />
                <Field label="Button text (the action)">
                  <input
                    value={content.ctaLabel}
                    onChange={(e) => set("ctaLabel", e.target.value)}
                    className={inputCls}
                    placeholder={goal.starter.ctaLabel}
                  />
                </Field>
                <Field label="Thank-you message (shown after they submit)">
                  <textarea
                    value={content.thankYouMessage}
                    onChange={(e) => set("thankYouMessage", e.target.value)}
                    rows={2}
                    className={inputCls}
                    placeholder={goal.starter.thankYouMessage}
                  />
                </Field>
              </div>
            ) : null}

            {stepDef.key === "design" ? (
              <div className="space-y-4">
                <Field label="Photo URL (optional)">
                  <input
                    value={content.imageUrl}
                    onChange={(e) => set("imageUrl", e.target.value)}
                    className={inputCls}
                    placeholder="https://…/your-photo.jpg"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Paste a link to a listing photo or local landmark. Leave
                    blank for a clean, text-only page.
                  </p>
                </Field>
                <Field label="Color theme">
                  <div className="flex gap-2">
                    {(["navy", "light"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => set("theme", t)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                          content.theme === t
                            ? "border-[#1b3d7a] bg-[#1b3d7a] text-white"
                            : "text-muted-foreground hover:border-foreground/30"
                        }`}
                      >
                        {t === "navy" ? "Navy (dark)" : "Light"}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            ) : null}

            {stepDef.key === "publish" ? (
              <div className="space-y-4">
                <Field label="Funnel name (only you see this)">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputCls}
                    placeholder="Spring seller campaign"
                  />
                </Field>
                <Field label="Link name">
                  <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <span className="shrink-0 text-muted-foreground">/l/…/</span>
                    <input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      placeholder="home-value"
                    />
                  </div>
                </Field>
                {status === "published" ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900/40 dark:bg-green-950/30">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-300">
                      <Check className="h-3.5 w-3.5" /> Live — share this link:
                    </p>
                    <CopyLink url={liveUrl} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Hit <strong>Publish</strong> (top right) to get your
                    shareable link. You can edit and re-publish anytime.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {/* Step nav */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || saving}
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
            </Button>
            {isLast ? (
              <Button size="sm" onClick={saveCurrent} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save changes
              </Button>
            ) : (
              <Button size="sm" onClick={next} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Next <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Right: live preview */}
        <div className="overflow-hidden rounded-2xl border bg-muted/30">
          <div className="border-b bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
            Live preview · exactly what your leads see
          </div>
          <div className="max-h-[72vh] overflow-y-auto">
            <FunnelRenderer content={content} preview />
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg border p-3 text-left"
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-[#1b3d7a]" : "bg-muted"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${url}` : url;
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 text-xs">
        {fullUrl}
      </code>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(fullUrl);
          setCopied(true);
          toast.success("Link copied!");
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
