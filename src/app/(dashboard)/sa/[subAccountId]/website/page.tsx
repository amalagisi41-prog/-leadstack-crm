"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ExternalLink, Globe, Loader2, Lock, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import {
  GITPAGE_SUBSCRIBE_URL,
  useGitpageStatus,
  type GitpageGateState,
} from "@/hooks/use-gitpage-status";
import { Button } from "@/components/ui/button";
import { WebsiteBuilder } from "@/components/website/website-builder";
import { MAX_WEBSITES_PER_SUBACCOUNT } from "@/lib/website/limits";
import type { WebsiteDoc } from "@/types/website";

/**
 * Website builder — a sub-account can hold up to MAX_WEBSITES_PER_SUBACCOUNT
 * sites. This page owns the collection subscription + the "Add website"
 * affordance and the account-wide activation gate; each site card renders via
 * <WebsiteBuilder/>, which holds its own form + build/status logic.
 */
export default function WebsitePage() {
  const { subAccountId, isAdmin, loading: subLoading } = useSubAccount();
  const [sites, setSites] = useState<WebsiteDoc[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [creating, setCreating] = useState(false);
  const { state: gateState, refresh: refreshGate } = useGitpageStatus();

  // Re-fire the heartbeat when the tab regains focus. Operators who go to
  // gitpage.site to subscribe and come back get an instant status update.
  useEffect(() => {
    function onFocus() {
      void refreshGate();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshGate]);

  useEffect(() => {
    if (!subAccountId) return;
    const ref = collection(
      getFirebaseDb(),
      `subAccounts/${subAccountId}/website`,
    );
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const docs = snap.docs.map((d) => {
          const data = d.data() as WebsiteDoc;
          return { ...data, id: d.id };
        });
        setSites(docs);
        setHydrated(true);
      },
      () => setHydrated(true),
    );
    return () => unsub();
  }, [subAccountId]);

  // Stable order: oldest first. Sorted client-side so a freshly-created doc
  // with a pending serverTimestamp still renders (a `createdAt` orderBy query
  // would briefly drop it).
  const orderedSites = useMemo(() => {
    const toMillis = (s: WebsiteDoc) => {
      const v = s.createdAt as { toMillis?: () => number } | null | undefined;
      return v?.toMillis?.() ?? 0;
    };
    return [...sites].sort((a, b) => toMillis(a) - toMillis(b));
  }, [sites]);

  const atCap = orderedSites.length >= MAX_WEBSITES_PER_SUBACCOUNT;
  const gateBlocked = gateState.kind === "subscribe-needed";

  const handleAdd = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/website`, {
        method: "POST",
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? "Could not add website.");
      toast.success("New website draft added — fill it in and build.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not add website.",
      );
    } finally {
      setCreating(false);
    }
  }, [subAccountId]);

  if (subLoading || !hydrated) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted/40" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Only sub-account admins can build the website.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Globe className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Websites</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Build up to {MAX_WEBSITES_PER_SUBACCOUNT} marketing sites for this
          client via gitpage.site. Add a site, fill in the details, hit Build,
          and we&apos;ll return a live URL in a minute or two.
        </p>
      </header>

      {/* Account-wide activation gate — when the operator hasn't pasted a
          GITPAGE_API_KEY yet (or it was rejected with a 401). Existing
          published sites stay live regardless; we still list them below. */}
      {gateBlocked && (
        <ActivationGate state={gateState} onRefresh={refreshGate} />
      )}

      {orderedSites.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <p className="text-sm font-medium">No websites yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Add your first site to get started. You can build up to{" "}
            {MAX_WEBSITES_PER_SUBACCOUNT} per client.
          </p>
          <Button
            type="button"
            className="mt-4"
            onClick={handleAdd}
            disabled={creating || gateBlocked}
          >
            {creating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            Add website
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orderedSites.map((site) => (
            <WebsiteBuilder
              key={site.id}
              subAccountId={subAccountId}
              doc={site}
              gateBlocked={gateBlocked}
            />
          ))}

          <div className="flex items-center justify-between rounded-2xl border border-dashed bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">
              {orderedSites.length} of {MAX_WEBSITES_PER_SUBACCOUNT} websites
              used.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAdd}
              disabled={creating || atCap || gateBlocked}
              title={atCap ? "Remove a website to add another." : undefined}
            >
              {creating ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              {atCap ? "Limit reached" : "Add website"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivationGate({
  state,
  onRefresh,
}: {
  state: GitpageGateState;
  onRefresh: () => Promise<boolean>;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const ok = await onRefresh();
      toast[ok ? "success" : "error"](
        ok ? "Status refreshed." : "Couldn't refresh — try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  if (state.kind !== "subscribe-needed") return null;
  const keyInvalid = state.lastError === "401_invalid_api_key";

  return (
    <section className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Lock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">
            {keyInvalid ? "Re-paste your API key" : "Add a website-builder key"}
          </h2>
          {keyInvalid ? (
            <p className="mt-1 text-sm text-muted-foreground">
              The website-builder API key was rejected — it may have been
              rotated upstream. Update <code>GITPAGE_API_KEY</code> in your
              hosting env vars and redeploy.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Spin up a marketing site for this client straight from the CRM
              once you&apos;ve dropped a website-builder API key into your env
              vars. Already have one? Set <code>GITPAGE_API_KEY</code> and
              redeploy — the Status tab on Agency home confirms when it&apos;s
              detected.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              render={
                <a href={GITPAGE_SUBSCRIBE_URL} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Get a key
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Re-check
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
