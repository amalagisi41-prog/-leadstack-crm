"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Home,
  Loader2,
  Lock,
  RefreshCw,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRelativeTime } from "@/lib/format";

/**
 * Sub-account IDX Listings settings panel. The realtor pastes their own IDX
 * Broker Platinum API access key (+ which approved MLS to search); we sync
 * listings into our own cache on a schedule and publish a branded public
 * search/detail site. See "IDX Listings (IDX Broker) v1".
 *
 * Locked entirely behind the agency's `idxEnabledByAgency` gate — this
 * section renders a "Locked by your agency" state when it's off, mirroring
 * every other agency-gated settings section.
 */
export function SubAccountIdxSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const gateOpen = subAccount?.idxEnabledByAgency === true;
  const cfg = subAccount?.idxConfig ?? null;
  const connected = !!cfg?.accessKey;
  const syncPassed = cfg?.lastSyncStatus === "success" && (cfg?.listingCount ?? 0) > 0;

  const [accessKey, setAccessKey] = useState("");
  const [mlsId, setMlsId] = useState(cfg?.mlsId ?? "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const publicIdxUrl = useMemo(() => {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    return `${base}/idx/${subAccountId}`;
  }, [subAccountId]);

  if (!isAdmin) return null;

  if (!gateOpen) {
    return (
      <section className="rounded-2xl border bg-card p-6">
        <header className="mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Home className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">IDX Listings</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Publish a branded, searchable MLS listings site synced from
              your own IDX Broker account.
            </p>
          </div>
        </header>
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-muted-foreground">
            <p className="font-medium text-foreground">
              IDX Listings is disabled for this sub-account.
            </p>
            <p className="mt-1">
              Your agency administrator controls this from the agency
              sub-accounts list (Manage → IDX Listings). Your IDX Broker
              access key and any synced listings are preserved — re-enabling
              resumes them instantly.
            </p>
          </div>
        </div>
      </section>
    );
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/idx/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKey: accessKey.trim(),
          mlsId: mlsId.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save IDX Broker connection.");
      }
      setAccessKey("");
      toast.success("IDX Broker connected. Click \"Sync now\" to pull listings.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/idx/sync`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        listingCount?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Sync failed.");
      }
      toast.success(`Synced ${data.listingCount ?? 0} listings.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        "Disconnect IDX Broker? Your public listings pages will go offline until you reconnect. Already-synced listings stay in place but stop refreshing.",
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/idx/config`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to disconnect.");
      }
      toast.success("IDX Broker disconnected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  }

  function copyPublicUrl() {
    void navigator.clipboard.writeText(publicIdxUrl);
    toast.success("Public IDX URL copied.");
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <Home className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">IDX Listings</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Paste your IDX Broker Platinum API access key (Account → API
            Access in your IDX Broker dashboard). Listings sync automatically
            every 6 hours — use &quot;Sync now&quot; to pull immediately.
          </p>
        </div>
      </header>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {[
          {
            number: 1,
            title: "Credentials",
            body: connected
              ? "Your access key is saved. Update it any time if the account changes."
              : "Paste your IDX Broker Platinum key and optional MLS id to connect the feed.",
            done: connected,
          },
          {
            number: 2,
            title: "Sync test",
            body: syncPassed
              ? `Last sync passed with ${cfg?.listingCount ?? 0} live listings.`
              : "Run one manual sync to confirm listings are flowing before you send traffic.",
            done: syncPassed,
          },
          {
            number: 3,
            title: "Go live",
            body: connected
              ? "Open or copy your public listings URL when you're ready to launch."
              : "Once connected, you'll get a branded public listings URL to share.",
            done: connected && syncPassed,
          },
        ].map((step) => (
          <div key={step.number} className="rounded-xl border bg-background p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#173B7A] text-sm font-semibold text-white">
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : step.number}
              </span>
              <p className="text-sm font-medium">{step.title}</p>
            </div>
            <p className="text-xs text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>

      {connected ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Connected{cfg?.mlsId ? ` — MLS ${cfg.mlsId}` : ""}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>
              <dt className="font-medium text-foreground">Listings synced</dt>
              <dd>{cfg?.listingCount ?? 0}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Last sync</dt>
              <dd>
                {cfg?.lastSyncAt ? formatRelativeTime(cfg.lastSyncAt) : "Never"}
              </dd>
            </div>
          </dl>
          {cfg?.lastSyncStatus === "failed" && cfg?.lastSyncError && (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Last sync failed: {cfg.lastSyncError}
            </p>
          )}
          <div className="mt-4 rounded-lg border bg-background p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Public listings URL
            </p>
            <p className="mt-1 break-all text-sm">{publicIdxUrl}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This is the page you can link from your site, ads, or email once
              your sync test looks right.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyPublicUrl}
              disabled={disconnecting || syncing}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy URL
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              render={
                <a href={publicIdxUrl} target="_blank" rel="noreferrer" />
              }
              disabled={disconnecting || syncing}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Open site
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting || syncing}
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
            <Button
              type="button"
              size="sm"
              onClick={handleSyncNow}
              disabled={syncing || disconnecting}
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Syncing…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Sync now
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="idx-access-key">IDX Broker access key</Label>
            <Input
              id="idx-access-key"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="a1b2c3d4e5f6..."
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idx-mls-id">MLS id (optional)</Label>
            <Input
              id="idx-mls-id"
              value={mlsId}
              onChange={(e) => setMlsId(e.target.value)}
              placeholder="Leave blank to use your account's default approved MLS"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              Only needed if your IDX Broker account is approved for more than
              one MLS.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" size="sm" disabled={saving || !accessKey.trim()}>
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Connect IDX Broker"
              )}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
