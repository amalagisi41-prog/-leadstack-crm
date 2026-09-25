"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, Wallet } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sub-account payment portal settings panel. Powers the Pay CTA on
 * invoices, paid booking-page deposits, and paid community group/course
 * purchases. Provider-agnostic by design: the operator pastes a link to
 * whatever payment portal they already use — PayPal.me, Venmo, Square, a
 * Stripe Payment Link, a bank's own pay page — instead of the app
 * integrating with one specific provider. The link is always shown as-is;
 * the app never templates an amount into it (providers format that too
 * differently to generalize).
 */
export function SubAccountPaymentPortalSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const cfg = subAccount?.paymentPortalConfig ?? null;
  const connected = !!cfg?.url;

  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  if (!isAdmin) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/payment-portal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), label: label.trim() || null }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        url?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save the payment link.");
      }
      setUrl("");
      setLabel("");
      toast.success("Payment portal connected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        "Disconnect your payment portal? Invoices, paid bookings, and paid community purchases will lose their Pay link until you reconnect one.",
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/payment-portal`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to disconnect.");
      }
      toast.success("Payment portal disconnected.");
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
          <h2 className="text-base font-semibold">Payments</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Connect your own payment portal — PayPal.me, Venmo, Square, a
            Stripe Payment Link, or anywhere else you already collect
            payment. We link to it as-is; you handle the transaction on
            your provider&apos;s side and mark paid here once funds land.
          </p>
        </div>
      </header>

      {connected ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Connected
            {cfg?.label ? ` — ${cfg.label}` : ""}
          </p>
          <a
            href={cfg!.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
          >
            {cfg!.url}
            <ExternalLink className="h-3 w-3" />
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            Every invoice, paid booking, and paid community purchase links
            here. Amounts are shown as text next to the link, not encoded
            in the URL — enter the total on your provider&apos;s page.
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
            <Label htmlFor="payment-portal-url">Payment link</Label>
            <Input
              id="payment-portal-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://paypal.me/yourbusiness, venmo.com/u/you, …"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              Any https link where a customer can pay you. We don&apos;t
              validate which provider it is — paste whatever you use.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-portal-label">Button label (optional)</Label>
            <Input
              id="payment-portal-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Pay via Venmo"
              maxLength={40}
              autoComplete="off"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={saving || !url.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Connect payment portal"
              )}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
