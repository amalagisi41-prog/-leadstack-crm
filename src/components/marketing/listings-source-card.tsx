"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Plus, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/format";
import type { ListingsImportSourceClient } from "@/types/listings-import";

/**
 * Connect any number of the sub-account's own public listings pages so
 * every property on each one lands in this workspace's inventory
 * automatically, kept in sync weekly (or on demand via "Sync now") —
 * instead of the operator retyping each property by hand or uploading a
 * file per property. A brokerage-affiliated agent may run their own site
 * AND have a page on the brokerage's site, so this is a list, not a
 * single connection.
 *
 * Mirrors the MLS feed card just above it: a dashed "nothing connected
 * yet" state that names the exact next action, a connected state that
 * shows real status per source rather than a bare toggle, and an honest
 * failure message instead of a silent zero.
 */
export function ListingsSourcesSection({
  subAccountId,
  isAdmin,
}: {
  subAccountId: string;
  isAdmin: boolean;
}) {
  const [sources, setSources] = useState<ListingsImportSourceClient[] | undefined>(
    undefined, // undefined = not loaded yet
  );
  const [urlInput, setUrlInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/marketing/listings-sources`);
      const data = (await res.json().catch(() => ({}))) as {
        sources?: ListingsImportSourceClient[];
      };
      setSources(data.sources ?? []);
    } catch {
      setSources([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  async function handleConnect() {
    if (!urlInput.trim()) return;
    setConnecting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/marketing/listings-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        propertyCount?: number;
      };
      if (!data.ok) throw new Error(data.error ?? "Could not sync that page.");
      toast.success(`Synced ${data.propertyCount} ${data.propertyCount === 1 ? "property" : "properties"}.`);
      setUrlInput("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect that page.");
      await load(); // still refresh — a failed sync is recorded on the source, not just tossed
    } finally {
      setConnecting(false);
    }
  }

  async function handleResync(sourceId: string) {
    setBusyId(sourceId);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/listings-sources/${sourceId}/resync`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        propertyCount?: number;
      };
      if (!data.ok) throw new Error(data.error ?? "Sync failed.");
      toast.success(`Synced ${data.propertyCount} ${data.propertyCount === 1 ? "property" : "properties"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      await load();
      setBusyId(null);
    }
  }

  async function handleDisconnect(sourceId: string) {
    setBusyId(sourceId);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/marketing/listings-sources/${sourceId}`, {
        method: "DELETE",
      });
      toast.success("Listings page disconnected. Already-synced properties stay in your inventory.");
      await load();
    } catch {
      toast.error("Could not disconnect. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (sources === undefined) {
    return <div className="bg-muted/50 h-20 animate-pulse rounded-2xl" />;
  }

  if (!isAdmin && sources.length === 0) return null; // nothing a collaborator can do here

  return (
    <div className="space-y-3">
      {sources.map((source) => (
        <ListingsSourceRow
          key={source.id}
          source={source}
          isAdmin={isAdmin}
          busy={busyId === source.id}
          onResync={() => void handleResync(source.id)}
          onDisconnect={() => void handleDisconnect(source.id)}
        />
      ))}

      {isAdmin && (
        <div className="bg-card rounded-2xl border border-dashed p-4 text-sm">
          <p className="font-medium">
            {sources.length === 0
              ? "Sync properties from your own site"
              : "Connect another listings page"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {sources.length === 0
              ? "Paste the page on your website that lists your properties (for sale, under contract, sold, off-market) — every property on it comes into this workspace, kept in sync weekly."
              : "Add another page — for example a brokerage site that also lists your properties. Each is kept in sync independently."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://yoursite.com/listings"
              className="max-w-sm"
            />
            <Button size="sm" onClick={handleConnect} disabled={connecting || !urlInput.trim()}>
              {connecting ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Syncing…
                </>
              ) : sources.length === 0 ? (
                <>
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  Connect
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add page
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ListingsSourceRow({
  source,
  isAdmin,
  busy,
  onResync,
  onDisconnect,
}: {
  source: ListingsImportSourceClient;
  isAdmin: boolean;
  busy: boolean;
  onResync: () => void;
  onDisconnect: () => void;
}) {
  const toneClass =
    source.status === "failed"
      ? "text-destructive"
      : source.status === "ready"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-foreground";

  return (
    <div className="bg-card rounded-2xl border p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Public listings page</p>
          <p className="mt-1 truncate font-medium">{source.url}</p>
          <p className={`mt-1 text-xs ${toneClass}`}>
            {source.status === "ready"
              ? `${source.propertyCount} ${source.propertyCount === 1 ? "property" : "properties"} synced`
              : source.status === "processing"
                ? "Syncing…"
                : source.status === "failed"
                  ? "Last sync failed"
                  : "Not synced yet"}
            {source.lastSyncedAt
              ? ` · last synced ${formatRelativeTime(new Date(source.lastSyncedAt))}`
              : ""}
          </p>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={onResync} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="outline" onClick={onDisconnect} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>
      {source.status === "failed" && source.errorMessage ? (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {source.errorMessage}
        </p>
      ) : null}
    </div>
  );
}
