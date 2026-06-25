"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiKeyMode, ApiKeyResponse, ApiKeyScope } from "@/types/api";

/**
 * Sub-account API keys panel — mint / list / revoke. Pairs with
 * `/api/sub-accounts/{id}/api-keys` (Bearer-token-issuing routes).
 *
 * UX contract:
 *  - Admin-only. `isAdmin` from useSubAccount() hides the section for
 *    collaborators. Server still enforces via requireSubAccountAdmin().
 *  - The raw key is shown ONCE, in the post-mint reveal panel. Subsequent
 *    list reads return only the prefix. The reveal stays visible until
 *    the operator explicitly dismisses it ("I've saved it").
 *  - No realtime / onSnapshot — Firestore rules deny client reads on
 *    apiKeys/* (defense-in-depth). The list refetches after every
 *    mutation instead.
 *  - Live + Test modes are listed together with a mode chip per row. A
 *    top-level "Show test keys" toggle hides test rows by default so the
 *    operator's production list stays clean.
 */

type View =
  | { kind: "list" }
  | { kind: "mint" }
  | { kind: "reveal"; key: ApiKeyResponse };

interface MintFormState {
  name: string;
  mode: ApiKeyMode;
  scope: ApiKeyScope;
}

const SCOPE_HELP: Record<ApiKeyScope, string> = {
  admin:
    "Full CRUD on every resource in this sub-account. Server-to-server only — never paste into a browser.",
  "forms-ingest":
    "Write-only, restricted to form submissions. Safe to embed in client-side JS on a custom landing page.",
};

export function SubAccountApiKeysSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const gateOpen = subAccount?.apiAccessEnabledByAgency === true;
  const [keys, setKeys] = useState<ApiKeyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTest, setShowTest] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [mintForm, setMintForm] = useState<MintFormState>({
    name: "",
    mode: "live",
    scope: "admin",
  });
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/api-keys`);
      const data = (await res.json().catch(() => ({}))) as {
        keys?: ApiKeyResponse[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load keys.");
      setKeys(data.keys ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load keys.");
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <KeyRound className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">API keys</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Programmatic access for Zapier, Make, custom landing pages, or
              anything else that needs to read or write data in this
              sub-account.
            </p>
          </div>
        </header>
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-muted-foreground">
            <p className="font-medium text-foreground">
              API access is disabled for this sub-account.
            </p>
            <p className="mt-1">
              Your agency administrator controls this from the agency
              sub-accounts list (Manage → Public API access). Existing keys
              and webhooks are preserved — re-enabling resumes them
              instantly without re-rotating Zapier integrations.
            </p>
          </div>
        </div>
      </section>
    );
  }

  async function handleMint(e: FormEvent) {
    e.preventDefault();
    const name = mintForm.name.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mode: mintForm.mode,
          scopes: [mintForm.scope],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        key?: ApiKeyResponse;
        error?: string;
      };
      if (!res.ok || !data.key) {
        throw new Error(data.error ?? "Failed to mint key.");
      }
      setMintForm({ name: "", mode: "live", scope: "admin" });
      setView({ kind: "reveal", key: data.key });
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mint key.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(key: ApiKeyResponse) {
    if (
      !confirm(
        `Revoke "${key.name}"? Any Zapier / integration using this key will start getting 401s immediately. This cannot be undone — mint a new key if you need to reconnect.`,
      )
    ) {
      return;
    }
    setRevokingId(key.id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/api-keys/${key.id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to revoke key.");
      }
      toast.success("Key revoked.");
      void refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke key.",
      );
    } finally {
      setRevokingId(null);
    }
  }

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Clipboard blocked — select the key and copy manually.");
    }
  }

  const visibleKeys = showTest
    ? keys
    : keys.filter((k) => k.mode === "live");
  const activeKeys = visibleKeys.filter((k) => !k.revokedAt);

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">API keys</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Programmatic access for Zapier, Make, custom landing pages, or
            anything else that needs to read or write data in this
            sub-account. Each key has a single mode (live / test) and scope.
          </p>
        </div>
      </header>

      {view.kind === "reveal" && view.key.secret && (
        <RevealPanel
          name={view.key.name}
          mode={view.key.mode}
          secret={view.key.secret}
          onCopy={() => copySecret(view.key.secret!)}
          onDone={() => setView({ kind: "list" })}
        />
      )}

      {view.kind === "mint" && (
        <form
          onSubmit={handleMint}
          className="mb-4 space-y-4 rounded-lg border bg-background p-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              value={mintForm.name}
              onChange={(e) =>
                setMintForm((s) => ({ ...s, name: e.target.value }))
              }
              placeholder="e.g. Zapier production, Webflow form"
              maxLength={60}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              An internal label — shown only to your team. Pick something
              that names the integration so revocations are easy.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Mode</Label>
            <ToggleGroup
              value={mintForm.mode}
              onChange={(v) => setMintForm((s) => ({ ...s, mode: v }))}
              options={[
                {
                  value: "live",
                  label: "Live",
                  description: "Writes real data. Sends real emails / SMS.",
                },
                {
                  value: "test",
                  label: "Test",
                  description:
                    "Sandboxed namespace. No real emails, SMS, or webhooks fire externally.",
                },
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Scope</Label>
            <ToggleGroup
              value={mintForm.scope}
              onChange={(v) => setMintForm((s) => ({ ...s, scope: v }))}
              options={[
                {
                  value: "admin",
                  label: "Admin",
                  description: SCOPE_HELP.admin,
                },
                {
                  value: "forms-ingest",
                  label: "Forms ingest",
                  description: SCOPE_HELP["forms-ingest"],
                },
              ]}
            />
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
              disabled={submitting || !mintForm.name.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create key"
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
          Show test keys
        </label>
        {view.kind === "list" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setView({ kind: "mint" })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New key
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border bg-background p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading keys…
        </div>
      ) : activeKeys.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background p-6 text-center">
          <p className="text-sm font-medium">No active keys yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mint a key to connect Zapier, Make, or a custom integration to
            this sub-account.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {activeKeys.map((k) => (
            <ApiKeyRow
              key={k.id}
              k={k}
              onRevoke={() => handleRevoke(k)}
              revoking={revokingId === k.id}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Keys grant access to this sub-account&apos;s data only.{" "}
        <strong>Admin</strong>-scope keys can read and write everything;
        treat them like passwords. <strong>Forms-ingest</strong> keys are
        safe to embed in client-side code. If a key leaks, revoke it
        immediately and mint a replacement — there is no &quot;regenerate&quot;.
      </p>
    </section>
  );
}

function ApiKeyRow({
  k,
  onRevoke,
  revoking,
}: {
  k: ApiKeyResponse;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const created = new Date(k.createdAt);
  const lastUsed = k.lastUsedAt ? new Date(k.lastUsedAt) : null;
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{k.name}</p>
          <ModeBadge mode={k.mode} />
          {k.scopes.map((s) => (
            <ScopeBadge key={s} scope={s} />
          ))}
        </div>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          lsk_{k.mode}_{k.prefix}_••••••••••••••••••••••••••••••••
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Created {created.toLocaleDateString()} ·{" "}
          {lastUsed
            ? `last used ${lastUsed.toLocaleString()}`
            : "never used"}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRevoke}
        disabled={revoking}
        className="shrink-0 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
      >
        {revoking ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </Button>
    </li>
  );
}

function ModeBadge({ mode }: { mode: ApiKeyMode }) {
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

function ScopeBadge({ scope }: { scope: ApiKeyScope }) {
  const label = scope === "admin" ? "Admin" : "Forms ingest";
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function RevealPanel({
  name,
  mode,
  secret,
  onCopy,
  onDone,
}: {
  name: string;
  mode: ApiKeyMode;
  secret: string;
  onCopy: () => void;
  onDone: () => void;
}) {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Copy your key now — you won&apos;t see it again
          </p>
          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
            <strong>{name}</strong> · <ModeBadge mode={mode} />
            <span className="ml-1">
              · Treat this like a password. Anyone with it has the same access
              you do.
            </span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md border bg-background p-2 font-mono text-xs">
        <code className="min-w-0 flex-1 break-all">{secret}</code>
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
          Store in your secret manager (1Password, Vercel env vars, Zapier
          secrets).
        </p>
        <Button type="button" size="sm" onClick={onDone}>
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          I&apos;ve saved it
        </Button>
      </div>
    </div>
  );
}

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; description: string }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              active
                ? "border-primary bg-primary/5"
                : "border-input bg-background hover:bg-muted/50"
            }`}
          >
            <p className="text-sm font-medium">{opt.label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {opt.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
