"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  DollarSign,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToAdAccounts } from "@/lib/firestore/ad-accounts";
import { formatCurrency } from "@/lib/format";
import type { AdAccountDoc, AdAccountPlatform } from "@/types/ad-accounts";

/**
 * "Ad Spend & Billing" — one place per client to see what they pay the
 * agency (the monthly retainer) next to what the agency spends running
 * their ads, broken out per platform account. Deliberately separate from
 * Marketing → Campaigns (this is money tracking, not campaign management).
 *
 * v1 is manual entry only. `source` on every ad account row is always
 * "manual" today; a live Meta Ads / Google Ads sync is a real but separate
 * follow-on build — each needs its own external approval (Meta's ads_read
 * scope needs its own App Review; Google Ads needs a developer token) that
 * has to happen before any sync code would even be testable.
 */

const PLATFORM_LABELS: Record<AdAccountPlatform, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  other: "Other",
};

export default function AdSpendBillingPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount, isAdmin } = useSubAccount();

  const [accounts, setAccounts] = useState<AdAccountDoc[]>([]);
  const [editingAccount, setEditingAccount] = useState<AdAccountDoc | null>(
    null,
  );
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [editingRetainer, setEditingRetainer] = useState(false);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsub = subscribeToAdAccounts(subAccountId, setAccounts);
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  const totalSpendCents = useMemo(
    () => accounts.reduce((sum, a) => sum + a.monthlySpendCents, 0),
    [accounts],
  );
  const retainerCents = subAccount?.monthlyRetainerCents ?? null;
  const retainerCurrency = subAccount?.monthlyRetainerCurrency ?? "USD";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ad Spend &amp; Billing
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          What this client pays you each month, next to what you spend
          running their ads — one place to track both.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Monthly retainer"
          value={
            retainerCents === null
              ? "Not set"
              : formatCurrency(retainerCents / 100, retainerCurrency)
          }
          sub="What this client pays the agency."
          action={
            isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingRetainer(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                {retainerCents === null ? "Set" : "Edit"}
              </Button>
            ) : null
          }
        />
        <SummaryCard
          label="Total ad spend"
          value={formatCurrency(totalSpendCents / 100)}
          sub={
            accounts.length === 0
              ? "No ad accounts tracked yet."
              : `Across ${accounts.length} ad account${accounts.length === 1 ? "" : "s"}.`
          }
        />
        <SummaryCard
          label="Margin"
          value={
            retainerCents === null
              ? "—"
              : formatCurrency(
                  (retainerCents - totalSpendCents) / 100,
                  retainerCurrency,
                )
          }
          sub={
            retainerCents === null
              ? "Set a monthly retainer to see margin."
              : "Retainer minus ad spend."
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Ad platform accounts</h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreatingAccount(true)}>
            <Plus className="h-4 w-4" />
            Add ad account
          </Button>
        )}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          isAdmin={isAdmin}
          onCreate={() => setCreatingAccount(true)}
        />
      ) : (
        <div className="bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground border-b text-left text-xs tracking-wider uppercase">
              <tr>
                <th className="px-4 py-2.5 font-medium">Platform</th>
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  Monthly spend
                </th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                {isAdmin && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <AdAccountRow
                  key={a.id}
                  account={a}
                  subAccountId={subAccountId}
                  isAdmin={isAdmin}
                  onEdit={() => setEditingAccount(a)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdAccountDialog
        open={creatingAccount || !!editingAccount}
        account={editingAccount}
        subAccountId={subAccountId}
        onClose={() => {
          setCreatingAccount(false);
          setEditingAccount(null);
        }}
      />

      <RetainerDialog
        open={editingRetainer}
        subAccountId={subAccountId}
        currentCents={retainerCents}
        currentCurrency={retainerCurrency}
        onClose={() => setEditingRetainer(false)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  action,
}: {
  label: string;
  value: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          {label}
        </p>
        {action}
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>
    </div>
  );
}

function EmptyState({
  isAdmin,
  onCreate,
}: {
  isAdmin: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="bg-card rounded-2xl border p-12 text-center">
      <DollarSign className="text-muted-foreground mx-auto h-10 w-10" />
      <h2 className="mt-4 text-base font-semibold">No ad accounts yet</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {isAdmin
          ? "Add this client's Meta Ads, Google Ads, or other ad platform accounts to start tracking spend."
          : "Ask a sub-account admin to add this client's ad platform accounts."}
      </p>
      {isAdmin && (
        <Button onClick={onCreate} className="mt-4">
          <Plus className="h-4 w-4" />
          Add ad account
        </Button>
      )}
    </div>
  );
}

function AdAccountRow({
  account,
  subAccountId,
  isAdmin,
  onEdit,
}: {
  account: AdAccountDoc;
  subAccountId: string;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (
      !confirm(`Remove "${account.label}" from Ad Spend & Billing tracking?`)
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ad-accounts/${account.id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      toast.success("Ad account removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3">
        <span className="bg-muted inline-flex rounded-full px-2 py-0.5 text-xs font-medium">
          {PLATFORM_LABELS[account.platform]}
        </span>
      </td>
      <td className="px-4 py-3 font-medium">
        {account.label}
        {account.notes && (
          <p className="text-muted-foreground mt-0.5 max-w-md truncate text-xs font-normal">
            {account.notes}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
        {formatCurrency(account.monthlySpendCents / 100, account.currency)}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Manual
        </span>
      </td>
      {isAdmin && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={handleDelete}
              title="Remove"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </td>
      )}
    </tr>
  );
}

function AdAccountDialog({
  open,
  account,
  subAccountId,
  onClose,
}: {
  open: boolean;
  account: AdAccountDoc | null;
  subAccountId: string;
  onClose: () => void;
}) {
  const editing = !!account;
  const [platform, setPlatform] = useState<AdAccountPlatform>("meta");
  const [label, setLabel] = useState("");
  const [spendDollars, setSpendDollars] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setPlatform(account.platform);
      setLabel(account.label);
      setSpendDollars((account.monthlySpendCents / 100).toFixed(2));
      setCurrency(account.currency);
      setNotes(account.notes);
    } else {
      setPlatform("meta");
      setLabel("");
      setSpendDollars("");
      setCurrency("USD");
      setNotes("");
    }
  }, [open, account]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      toast.error("Account name is required.");
      return;
    }
    const spendNum = spendDollars.trim() === "" ? 0 : Number(spendDollars);
    if (!Number.isFinite(spendNum) || spendNum < 0) {
      toast.error("Monthly spend must be a non-negative number.");
      return;
    }
    const monthlySpendCents = Math.round(spendNum * 100);

    setSaving(true);
    try {
      const payload = {
        platform,
        label: trimmedLabel,
        monthlySpendCents,
        currency: currency.trim().toUpperCase(),
        notes: notes.trim(),
      };
      const res = await fetch(
        editing
          ? `/api/sub-accounts/${subAccountId}/ad-accounts/${account!.id}`
          : `/api/sub-accounts/${subAccountId}/ad-accounts`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save.");
      }
      toast.success(editing ? "Ad account updated." : "Ad account added.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit ad account" : "Add ad account"}
          </DialogTitle>
          <DialogDescription>
            Manual entry — the monthly spend is whatever you last checked in
            the platform&apos;s own dashboard. Live sync isn&apos;t built yet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ad-account-platform">Platform</Label>
            <select
              id="ad-account-platform"
              value={platform}
              onChange={(e) =>
                setPlatform(e.target.value as AdAccountPlatform)
              }
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="meta">Meta Ads (Facebook/Instagram)</option>
              <option value="google">Google Ads</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-account-label">Account name</Label>
            <Input
              id="ad-account-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Acme Realty — Meta Ads"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ad-account-spend">Monthly spend</Label>
              <Input
                id="ad-account-spend"
                type="number"
                step="0.01"
                min="0"
                value={spendDollars}
                onChange={(e) => setSpendDollars(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-account-currency">Currency</Label>
              <Input
                id="ad-account-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-account-notes">Notes</Label>
            <Textarea
              id="ad-account-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional. E.g. who manages this account."
              rows={2}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : editing ? (
                "Save"
              ) : (
                "Add"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetainerDialog({
  open,
  subAccountId,
  currentCents,
  currentCurrency,
  onClose,
}: {
  open: boolean;
  subAccountId: string;
  currentCents: number | null;
  currentCurrency: string;
  onClose: () => void;
}) {
  const [amountDollars, setAmountDollars] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmountDollars(
      currentCents === null ? "" : (currentCents / 100).toFixed(2),
    );
    setCurrency(currentCurrency);
  }, [open, currentCents, currentCurrency]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = amountDollars.trim();
    const monthlyRetainerCents =
      trimmed === "" ? null : Math.round(Number(trimmed) * 100);
    if (
      monthlyRetainerCents !== null &&
      (!Number.isFinite(monthlyRetainerCents) || monthlyRetainerCents < 0)
    ) {
      toast.error("Retainer must be a non-negative number, or left blank.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyRetainerCents,
          currency: currency.trim().toUpperCase(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save.");
      toast.success("Monthly retainer updated.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Monthly retainer</DialogTitle>
          <DialogDescription>
            What this client pays the agency each month. Manual — AgentStack
            doesn&apos;t bill your clients on your behalf, so there&apos;s no
            live source for this figure.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="retainer-amount">Amount</Label>
              <Input
                id="retainer-amount"
                type="number"
                step="0.01"
                min="0"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="retainer-currency">Currency</Label>
              <Input
                id="retainer-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Leave the amount blank to clear it back to &quot;Not set&quot;.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
