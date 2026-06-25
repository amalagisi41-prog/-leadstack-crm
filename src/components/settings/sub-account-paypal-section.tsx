"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sub-account PayPal settings panel — powers the Products + Invoices
 * payment flow. Operator pastes a PayPal.me username; on invoice send
 * we generate `https://paypal.me/{username}/{amount}{currency}`.
 *
 * No API roundtrip to PayPal (paypal.me has no validate endpoint).
 * Server-side validation enforces username format (1-20 chars,
 * alphanumeric + hyphens). Sub-account owner sees their generated
 * paypal.me URL after save for a quick sanity-click.
 */

export function SubAccountPayPalSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const cfg = subAccount?.paypalConfig ?? null;
  const connected = !!cfg?.username;

  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  if (!isAdmin) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/paypal-integration`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim() }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        username?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save PayPal.me username.");
      }
      setUsername("");
      toast.success(`PayPal connected — paypal.me/${data.username}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        "Disconnect PayPal? Sending new invoices will require reconnecting. Invoices already sent stay valid (their paypal.me links keep working).",
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/paypal-integration`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to disconnect.");
      }
      toast.success("PayPal disconnected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <Wallet className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Payments — PayPal</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Paste your PayPal.me username so invoices can collect payment via
            a PayPal-hosted page. Set one up at{" "}
            <a
              href="https://www.paypal.com/paypalme/grab"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              paypal.com/paypalme
            </a>{" "}
            (free, takes a minute).
          </p>
        </div>
      </header>

      {connected ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Connected as{" "}
            <a
              href={`https://paypal.me/${cfg!.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline-offset-4 hover:underline"
            >
              paypal.me/{cfg!.username}
            </a>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Each invoice you send generates a unique payment URL with the
            invoice total pre-filled. PayPal handles the rest; you mark the
            invoice paid manually once funds land in your account.
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Disconnecting…
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="paypal-username">PayPal.me username</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">paypal.me/</span>
              <Input
                id="paypal-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yourbusiness"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              1-20 characters, letters/digits/hyphens. We don&apos;t store any
              keys or credentials — just the username.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={saving || !username.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Connect PayPal"
              )}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
