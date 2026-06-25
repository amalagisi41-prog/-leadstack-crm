"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  PauseCircle,
  PlayCircle,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  Webhook,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  WebhookEventType,
  WebhookSubscriptionResponse,
} from "@/types/webhooks";
import {
  WEBHOOK_EVENT_CATEGORIES,
  activeCategoryOf,
  categoryOf,
} from "@/lib/webhooks/event-categories";

/**
 * Webhook subscriptions panel. Mounted alongside API keys on the
 * sub-account settings page. Admin-only — collaborators see nothing.
 *
 * Same single-reveal pattern as the API keys section: the raw
 * `signingSecret` is shown ONCE on the post-create panel. Subsequent
 * reads return only metadata. Subscribers store the secret in their own
 * vault and verify HMAC on every received delivery.
 *
 * Mode (live / test) is selected at create time; a "Show test
 * subscriptions" toggle filters the list.
 */

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "reveal"; sub: WebhookSubscriptionResponse };

interface CreateFormState {
  url: string;
  description: string;
  mode: "live" | "test";
  events: Set<WebhookEventType>;
}

export function SubAccountWebhooksSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const gateOpen = subAccount?.apiAccessEnabledByAgency === true;
  const [subs, setSubs] = useState<WebhookSubscriptionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTest, setShowTest] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [form, setForm] = useState<CreateFormState>({
    url: "",
    description: "",
    mode: "live",
    events: new Set(),
  });
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/webhook-subscriptions`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        subscriptions?: WebhookSubscriptionResponse[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load webhooks.");
      setSubs(data.subscriptions ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [subAccountId]);

  useEffect(() => {
    if (!isAdmin || !gateOpen) return;
    void refetch();
  }, [isAdmin, gateOpen, refetch]);

  if (!isAdmin) return null;

  if (!gateOpen) {
    return (
      <section className="rounded-2xl border bg-card p-6">
        <header className="mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <Webhook className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Webhooks</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              POST events to your own endpoints — Slack, Make.com, n8n, or
              a custom server.
            </p>
          </div>
        </header>
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-muted-foreground">
            <p className="font-medium text-foreground">
              Webhooks are disabled for this sub-account.
            </p>
            <p className="mt-1">
              Webhooks live behind the same agency gate as API keys
              (Manage → Public API access). Existing subscriptions are
              preserved and resume firing the moment your agency
              administrator re-enables access.
            </p>
          </div>
        </div>
      </section>
    );
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const url = form.url.trim();
    if (!url) {
      toast.error("URL is required.");
      return;
    }
    if (form.events.size === 0) {
      toast.error("Pick at least one event to subscribe to.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/webhook-subscriptions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            mode: form.mode,
            events: Array.from(form.events),
            description: form.description.trim() || null,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        subscription?: WebhookSubscriptionResponse;
        error?: string;
      };
      if (!res.ok || !data.subscription) {
        throw new Error(data.error ?? "Failed to create webhook.");
      }
      setForm({
        url: "",
        description: "",
        mode: "live",
        events: new Set(),
      });
      setView({ kind: "reveal", sub: data.subscription });
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendTest(sub: WebhookSubscriptionResponse) {
    if (sub.status === "paused") {
      toast.error("Resume the webhook before sending a test event.");
      return;
    }
    setBusyId(sub.id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/webhook-subscriptions/${sub.id}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        type?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to send test event.");
      }
      toast.success(
        data.message ?? `Test event '${data.type}' dispatched.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleTogglePause(sub: WebhookSubscriptionResponse) {
    setBusyId(sub.id);
    try {
      const next = sub.status === "active" ? "paused" : "active";
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/webhook-subscriptions/${sub.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update.");
      toast.success(next === "active" ? "Webhook resumed." : "Webhook paused.");
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(sub: WebhookSubscriptionResponse) {
    if (
      !confirm(
        `Delete webhook for ${sub.url}? In-flight deliveries will be cancelled. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(sub.id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/webhook-subscriptions/${sub.id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete.");
      toast.success("Webhook deleted.");
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Clipboard blocked — copy manually.");
    }
  }

  function toggleEvent(ev: WebhookEventType) {
    setForm((s) => {
      const next = new Set(s.events);
      if (next.has(ev)) {
        next.delete(ev);
      } else {
        // Single-category rule: ignore clicks from a different category
        // while one is locked in (the buttons are disabled too, this is a
        // belt-and-suspenders guard).
        const active = activeCategoryOf(s.events);
        if (active && active !== categoryOf(ev)) return s;
        next.add(ev);
      }
      return { ...s, events: next };
    });
  }

  const visible = showTest ? subs : subs.filter((s) => s.mode === "live");
  // The category locked in by the current selection (null = none yet).
  const activeCategory = activeCategoryOf(form.events);

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
          <Webhook className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Webhooks</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            POST events to your own endpoints — Slack, Make.com, n8n, or a
            custom server. Each delivery is signed with HMAC-SHA256 so you
            can verify it came from us.
          </p>
        </div>
      </header>

      {view.kind === "reveal" && view.sub.signingSecret && (
        <RevealPanel
          sub={view.sub}
          onCopy={() => copySecret(view.sub.signingSecret!)}
          onDone={() => setView({ kind: "list" })}
        />
      )}

      {view.kind === "create" && (
        <form
          onSubmit={handleCreate}
          className="mb-4 space-y-4 rounded-lg border bg-background p-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url">Destination URL</Label>
            <Input
              id="webhook-url"
              type="url"
              value={form.url}
              onChange={(e) => setForm((s) => ({ ...s, url: e.target.value }))}
              placeholder="https://example.com/webhooks/leadstack"
              autoComplete="off"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Must be reachable over the public internet. We POST JSON with
              an HMAC signature.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="webhook-desc">Description (optional)</Label>
            <Input
              id="webhook-desc"
              value={form.description}
              onChange={(e) =>
                setForm((s) => ({ ...s, description: e.target.value }))
              }
              placeholder="e.g. Slack alerts, internal sync"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Mode</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["live", "test"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm((s) => ({ ...s, mode: m }))}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.mode === m
                      ? "border-primary bg-primary/5"
                      : "border-input bg-background hover:bg-muted/50"
                  }`}
                >
                  <p className="text-sm font-medium capitalize">{m}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {m === "live"
                      ? "Receives events from production API traffic."
                      : "Receives events only from test-mode API requests."}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Events ({form.events.size} selected)</Label>
            <p className="text-[11px] text-muted-foreground">
              A webhook subscribes to one category. Pick events from a single
              category below — the rest lock until you clear your selection.
            </p>
            <div className="space-y-3 rounded-lg border p-3">
              {WEBHOOK_EVENT_CATEGORIES.map((group) => {
                const locked =
                  activeCategory !== null && activeCategory !== group.label;
                return (
                  <div
                    key={group.label}
                    className={locked ? "opacity-40" : undefined}
                  >
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {group.label}
                      {activeCategory === group.label && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-normal text-primary">
                          selected
                        </span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.events.map((ev) => {
                        const active = form.events.has(ev);
                        return (
                          <button
                            key={ev}
                            type="button"
                            disabled={locked}
                            onClick={() => toggleEvent(ev)}
                            title={
                              locked
                                ? "A webhook can only target one category. Clear your selection to switch categories."
                                : undefined
                            }
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-mono transition-colors ${
                              locked
                                ? "cursor-not-allowed border-dashed border-input bg-muted/30 text-muted-foreground/50"
                                : active
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                            }`}
                          >
                            {ev}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              The full registry is in `/docs/api`. Adding more events later
              requires editing the subscription.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setView({ kind: "list" })}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                submitting ||
                !form.url.trim() ||
                form.events.size === 0
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create webhook"
              )}
            </Button>
          </div>
        </form>
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-input"
            checked={showTest}
            onChange={(e) => setShowTest(e.target.checked)}
          />
          Show test webhooks
        </label>
        {view.kind === "list" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setView({ kind: "create" })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New webhook
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border bg-background p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading webhooks…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background p-6 text-center">
          <p className="text-sm font-medium">No webhooks yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Send events to Slack, Make.com, or your own server when things
            happen in this sub-account.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((s) => (
            <SubRow
              key={s.id}
              sub={s}
              onSendTest={() => handleSendTest(s)}
              onTogglePause={() => handleTogglePause(s)}
              onDelete={() => handleDelete(s)}
              busy={busyId === s.id}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Subscriber URLs receive a <code>LeadStack-Signature</code> header
        with each POST. Verify it server-side before trusting the payload.
        Failed deliveries retry 3 times (1m / 5m / 30m); after 10 consecutive
        failures the webhook auto-pauses.
      </p>
    </section>
  );
}

function SubRow({
  sub,
  onSendTest,
  onTogglePause,
  onDelete,
  busy,
}: {
  sub: WebhookSubscriptionResponse;
  onSendTest: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const lastDelivery = sub.lastDeliveryAt ? new Date(sub.lastDeliveryAt) : null;
  const isPaused = sub.status === "paused";
  return (
    <li
      className={`rounded-lg border bg-background p-3 ${
        isPaused ? "border-amber-500/40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-mono text-xs text-foreground">
              {sub.url}
            </p>
            <ModeBadge mode={sub.mode} />
            {isPaused && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                {sub.pausedReason === "circuit_breaker"
                  ? "Auto-paused"
                  : "Paused"}
              </span>
            )}
          </div>
          {sub.description && (
            <p className="mt-1 text-xs text-muted-foreground">
              {sub.description}
            </p>
          )}
          {/* Event-type pills — exactly what triggers this webhook. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {sub.events.length === 0 ? (
              <span className="rounded-full border border-input bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                all events
              </span>
            ) : (
              sub.events.map((ev) => (
                <span
                  key={ev}
                  className="rounded-full border border-cyan-500/30 bg-cyan-500/5 px-2 py-0.5 font-mono text-[10px] text-cyan-700 dark:text-cyan-300"
                >
                  {ev}
                </span>
              ))
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {lastDelivery
              ? `last delivery ${lastDelivery.toLocaleString()} (HTTP ${
                  sub.lastDeliveryStatus ?? "—"
                })`
              : "no deliveries yet"}
            {sub.consecutiveFailures > 0 && (
              <>
                {" · "}
                <span className="text-rose-600 dark:text-rose-400">
                  {sub.consecutiveFailures} consecutive failure
                  {sub.consecutiveFailures === 1 ? "" : "s"}
                </span>
              </>
            )}
          </p>
          {sub.lastErrorMessage && (
            <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-400">
              Last error: {sub.lastErrorMessage}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSendTest}
            disabled={busy || isPaused}
            title={
              isPaused
                ? "Resume the webhook before sending a test"
                : "Send a synthetic event to verify your endpoint"
            }
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onTogglePause}
            disabled={busy}
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? (
              <PlayCircle className="h-3.5 w-3.5" />
            ) : (
              <PauseCircle className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={busy}
            className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function ModeBadge({ mode }: { mode: "live" | "test" }) {
  if (mode === "live") {
    return (
      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
        Live
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
      Test
    </span>
  );
}

function RevealPanel({
  sub,
  onCopy,
  onDone,
}: {
  sub: WebhookSubscriptionResponse;
  onCopy: () => void;
  onDone: () => void;
}) {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Copy your signing secret now — you won&apos;t see it again
          </p>
          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
            Verify the <code>LeadStack-Signature</code> header on each
            delivery using this secret. Store it in your secret manager.
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md border bg-background p-2 font-mono text-xs">
        <code className="min-w-0 flex-1 break-all">{sub.signingSecret}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCopy}
          className="shrink-0"
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="h-3 w-3" />
          Verification instructions: see /docs/api → Webhooks.
        </p>
        <Button type="button" size="sm" onClick={onDone}>
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          I&apos;ve saved it
        </Button>
      </div>
    </div>
  );
}
