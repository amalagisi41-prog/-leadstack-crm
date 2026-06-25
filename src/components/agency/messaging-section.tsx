"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Mail, MessageSquare, Radio } from "lucide-react";

interface MessagingConfig {
  sms: {
    configured: boolean;
    fromNumber: string | null;
    accountSidMasked: string | null;
    authTokenSet: boolean;
    sharedAllowed: boolean;
  };
  email: {
    configured: boolean;
    fromAddress: string | null;
    apiKeySet: boolean;
  };
}

/** Minimal accessible on/off switch (no UI primitive exists in the kit). */
function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
        (checked ? "bg-emerald-500" : "bg-muted-foreground/30")
      }
    >
      <span
        className={
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
          (checked ? "translate-x-4" : "translate-x-0.5")
        }
      />
    </button>
  );
}

/** A green/red status pill. */
function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (ok
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-red-500/10 text-red-600 dark:text-red-400")
      }
    >
      <span
        className={
          "inline-block h-1.5 w-1.5 rounded-full " +
          (ok ? "bg-emerald-500" : "bg-red-500")
        }
      />
      {label}
    </span>
  );
}

/** One label/value row in a provider block. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs">{value}</span>
    </div>
  );
}

export function MessagingSection() {
  const [config, setConfig] = useState<MessagingConfig | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);

  async function setSharedSmsAllowed(next: boolean) {
    if (!config) return;
    const prev = config.sms.sharedAllowed;
    // Optimistic flip; revert on failure.
    setConfig({ ...config, sms: { ...config.sms, sharedAllowed: next } });
    setSavingPolicy(true);
    try {
      const res = await fetch("/api/agency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedSmsAllowed: next }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Could not save.");
      toast.success(
        next
          ? "Sub-accounts can use the shared SMS sender."
          : "Shared SMS disabled — sub-accounts must use their own number.",
      );
    } catch (err) {
      setConfig((c) =>
        c ? { ...c, sms: { ...c.sms, sharedAllowed: prev } } : c,
      );
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSavingPolicy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/agency/messaging-config");
        if (!res.ok) throw new Error();
        const d = (await res.json()) as MessagingConfig;
        if (alive) setConfig(d);
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <Radio className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Messaging (shared senders)</h2>
          <p className="text-xs text-muted-foreground">
            The deployment-wide Twilio (SMS) and Resend (email) senders every
            sub-account falls back to when it has no dedicated config of its
            own. Set via environment variables — read-only here.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error || !config ? (
        <p className="text-xs text-muted-foreground">
          Couldn&rsquo;t load messaging configuration.
        </p>
      ) : (
        <div className="space-y-4">
          {/* SMS — Twilio */}
          <div className="rounded-xl border bg-background p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                SMS · Twilio
              </span>
              <StatusPill
                ok={config.sms.configured}
                label={config.sms.configured ? "Configured" : "Not configured"}
              />
            </div>
            <div className="divide-y">
              <Field
                label="From number"
                value={config.sms.fromNumber ?? "—"}
              />
              <Field
                label="Account SID"
                value={config.sms.accountSidMasked ?? "—"}
              />
              <Field
                label="Auth token"
                value={config.sms.authTokenSet ? "Set" : "Not set"}
              />
            </div>

            {/* Policy: may sub-accounts fall back to this shared sender? */}
            <div className="mt-3 flex items-start justify-between gap-3 border-t pt-3">
              <div>
                <p className="text-xs font-medium">
                  Allow sub-accounts to use this shared sender
                </p>
                <p className="text-[11px] text-muted-foreground">
                  On by default. Turn off to require every sub-account to
                  configure its own dedicated Twilio number — SMS steps and
                  sends are blocked until they do.
                </p>
              </div>
              <Toggle
                checked={config.sms.sharedAllowed}
                disabled={savingPolicy}
                onChange={setSharedSmsAllowed}
              />
            </div>
          </div>

          {/* Email — Resend */}
          <div className="rounded-xl border bg-background p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email · Resend
              </span>
              <StatusPill
                ok={config.email.configured}
                label={
                  config.email.configured ? "Configured" : "Not configured"
                }
              />
            </div>
            <div className="divide-y">
              <Field
                label="From address"
                value={config.email.fromAddress ?? "—"}
              />
              <Field
                label="API key"
                value={config.email.apiKeySet ? "Set" : "Not set"}
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            To change these, update the environment variables
            (<code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>,{" "}
            <code>TWILIO_FROM_NUMBER</code>, <code>RESEND_API_KEY</code>,{" "}
            <code>EMAIL_FROM</code>) in your hosting provider and redeploy. Live
            reachability (credential + webhook checks) is shown on{" "}
            <Link href="/agency" className="underline underline-offset-2">
              Agency → Status
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}
