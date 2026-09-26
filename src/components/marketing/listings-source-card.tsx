"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/format";
import type { ListingsImportSourceClient } from "@/types/listings-import";

/**
 * Connect the sub-account's own public listings page so every property on
 * it lands in this workspace's inventory automatically, kept in sync
 * weekly (or on demand via "Sync now") — instead of the operator retyping
 * each property by hand or uploading a file per property.
 *
 * Mirrors the MLS feed card just above it: a dashed "not connected yet"
 * state that names the exact next action, a connected state that shows
 * real status rather than a bare toggle, and an honest failure message
 * instead of a silent zero.
 */
export function ListingsSourceCard({
  subAccountId,
  isAdmin,
}: {
  subAccountId: string;
  isAdmin: boolean;
}) {
  const [source, setSource] = useState<ListingsImportSourceClient | null | undefined>(
    undefined, // undefined = not loaded yet; null = loaded, none connected
  );
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/marketing/listings-source`);
      const data = (await res.json().catch(() => ({}))) as {
        source?: ListingsImportSourceClient | null;
      };
      setSource(data.source ?? null);
    } catch {
      setSource(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  async function handleConnect() {
    if (!urlInput.trim()) return;
    setBusy("connect");
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/marketing/listings-source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        propertyCount?: number;
        source?: ListingsImportSourceClient;
      };
      if (data.source) setSource(data.source);
      if (!data.ok) throw new Error(data.error ?? "Could not sync that page.");
      toast.success(`Synced ${data.propertyCount} ${data.propertyCount === 1 ? "property" : "properties"}.`);
      setUrlInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect that page.");
    } finally {
      setBusy(null);
    }
  }

  async function handleResync() {
    setBusy("sync");
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/listings-source/resync`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        propertyCount?: number;
        source?: ListingsImportSourceClient;
      };
      if (data.source) setSource(data.source);
      if (!data.ok) throw new Error(data.error ?? "Sync failed.");
      toast.success(`Synced ${data.propertyCount} ${data.propertyCount === 1 ? "property" : "properties"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    setBusy("disconnect");
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/marketing/listings-source`, {
        method: "DELETE",
      });
      setSource(null);
      toast.success("Listings page disconnected. Already-synced properties stay in your inventory.");
    } catch {
      toast.error("Could not disconnect. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (source === undefined) {
    return <div className="bg-muted/50 h-20 animate-pulse rounded-2xl" />;
  }

  if (!source) {
    if (!isAdmin) return null; // nothing a collaborator can do here
    return (
      <div className="bg-card rounded-2xl border border-dashed p-4 text-sm">
        <p className="font-medium">Sync properties from your own site</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Paste the page on your website that lists your properties (for sale,
          under contract, sold, off-market) — every property on it comes into
          this workspace, kept in sync weekly.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://yoursite.com/listings"
            className="max-w-sm"
          />
          <Button size="sm" onClick={handleConnect} disabled={busy !== null || !urlInput.trim()}>
            {busy === "connect" ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <Link2 className="mr-1 h-3.5 w-3.5" />
                Connect
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

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
            <Button size="sm" variant="outline" onClick={handleResync} disabled={busy !== null}>
              {busy === "sync" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={busy !== null}>
              {busy === "disconnect" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unlink className="h-3.5 w-3.5" />
              )}
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
