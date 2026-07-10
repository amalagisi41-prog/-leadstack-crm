"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building, Copy, Loader2, Lock, RefreshCw } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToIdxListings } from "@/lib/firestore/idx-listings";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { IdxListingDoc } from "@/types/idx";

/**
 * IDX Listings — operator-facing browser over the synced MLS listings, plus
 * sync status and a copyable link to the public search page. Gated by
 * `idxEnabledByAgency`; renders a locked state when off. Actual credential
 * management lives in Settings (SubAccountIdxSection) — this page is for
 * day-to-day browsing + sharing the public link.
 */
export default function IdxListingsPage() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [listings, setListings] = useState<IdxListingDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const gateOn = subAccount?.idxEnabledByAgency === true;
  const cfg = subAccount?.idxConfig ?? null;

  useEffect(() => {
    if (!subAccountId || !gateOn) return;
    const unsub = subscribeToIdxListings(
      subAccountId,
      (list) => {
        setListings(list);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return () => unsub();
  }, [subAccountId, gateOn]);

  if (!gateOn) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-base font-semibold">
            IDX Listings is locked by your agency
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask your agency administrator to enable IDX Listings for this
            sub-account.
          </p>
        </div>
      </div>
    );
  }

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/idx/${subAccountId}`
      : `/idx/${subAccountId}`;

  const activeListings = listings.filter((l) => l.status === "active");

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Header />
        {isAdmin && (
          <Button size="sm" onClick={handleSyncNow} disabled={syncing}>
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
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Public search page</p>
          <p className="truncate text-xs text-muted-foreground">{publicUrl}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(publicUrl);
            toast.success("Link copied.");
          }}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy link
        </Button>
      </div>

      {cfg && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Active listings" value={String(activeListings.length)} />
          <StatCard
            label="Last sync"
            value={cfg.lastSyncAt ? formatRelativeTime(cfg.lastSyncAt) : "Never"}
          />
          <StatCard
            label="Status"
            value={cfg.lastSyncStatus === "failed" ? "Failed" : "OK"}
            tone={cfg.lastSyncStatus === "failed" ? "destructive" : "default"}
          />
        </div>
      )}

      {!loaded ? (
        <div className="h-32 animate-pulse rounded-2xl bg-muted/50" />
      ) : activeListings.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          No active listings yet. Connect your IDX Broker account in Settings,
          then click &quot;Sync now&quot;.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Address</th>
                <th className="px-4 py-2 text-left">City</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Beds/Baths</th>
              </tr>
            </thead>
            <tbody>
              {activeListings.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <a
                      href={`/idx/${subAccountId}/${l.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {l.address || l.id}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {l.city}, {l.state}
                  </td>
                  <td className="px-4 py-2 text-right">
                    ${l.price.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {l.beds} / {l.baths}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="min-w-0">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Building className="h-5 w-5" />
        IDX Listings
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        MLS listings synced from your IDX Broker account, plus your public
        search page.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "destructive";
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === "destructive"
            ? "mt-1 text-lg font-semibold text-destructive"
            : "mt-1 text-lg font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}
