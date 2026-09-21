"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Building,
  Check,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToIdxListings } from "@/lib/firestore/idx-listings";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  describeListingSource,
  MARKETING_STATUS_LABELS,
  MARKETING_STATUSES,
  resolveMarketingStatus,
} from "@/lib/marketing/listing-source";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";
import { cn } from "@/lib/utils";
import type { IdxListingDoc, ListingMarketingStatus } from "@/types/idx";
import type { ListingInquiryStat } from "@/types/listing-inquiries";
import type { IdxConfig } from "@/types/tenancy";

/**
 * Listings — the one place a sub-account sees every property it holds, and
 * picks which ones to market.
 *
 * This screen used to be an IDX-only browser: it filtered to
 * `status === "active"`, so pending, sold, off-market, and every manually
 * added property were invisible, and it offered no way to act on a row. An
 * agent could see their inventory here and then had to retype an MLS number
 * on the campaigns page to use any of it — the "never ask the user for
 * something the app can find out" rule, broken on the one screen that
 * already had the answer.
 *
 * On-market and off-market property share a collection
 * (`subAccounts/{id}/idxListings`), so both render here from one subscription.
 *
 * **The IDX feed enriches this screen; it never gates it.** Most workspaces
 * have no IDX Broker account on day one, and manual/off-market inventory has
 * to work for them — so the page always renders, and only the MLS half
 * (sync, sync status, public search page) depends on the agency gate plus a
 * connected account.
 */

type SourceFilter = "all" | "mls" | "manual";

const STATUS_TONES: Record<ListingMarketingStatus, string> = {
  new: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "under-contract": "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  "just-sold": "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  "off-market": "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400",
};

const BLANK_FORM = {
  address: "",
  city: "",
  state: "",
  zip: "",
  price: "",
  beds: "",
  baths: "",
  sqft: "",
  propertyType: "",
  remarks: "",
  marketingStatus: "off-market" as ListingMarketingStatus,
};

export default function ListingsPage() {
  const { subAccountId, subAccount, isAdmin, saPath } = useSubAccount();
  const [listings, setListings] = useState<IdxListingDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  // A failed read is NOT an empty inventory. Kept separate so the screen can
  // say which of the two it is — see the note on the subscription below.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [briefIds, setBriefIds] = useState<Set<string>>(new Set());
  // Inquiry counts per listing. `null` means "not loaded or the read failed" —
  // distinct from an empty object, which means "loaded, nobody has enquired".
  // Rendering 0 for the first case would tell an agent their marketing
  // produced nothing when in fact nothing was measured.
  const [inquiryStats, setInquiryStats] = useState<Record<
    string,
    ListingInquiryStat
  > | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    ListingMarketingStatus | "all"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [showAdd, setShowAdd] = useState(false);

  const gateOn = subAccount?.idxEnabledByAgency === true;
  const cfg = subAccount?.idxConfig ?? null;
  const feedConnected = gateOn && cfg?.enabled === true;

  useEffect(() => {
    if (!subAccountId) return;
    const unsub = subscribeToIdxListings(
      subAccountId,
      (list) => {
        setListings(list);
        setLoadError(null);
        setLoaded(true);
      },
      // This used to be `() => setLoaded(true)` — the error was dropped and
      // the screen rendered "No properties yet". That is the worst possible
      // reading of a failed query: an agent who has just saved a property is
      // told their inventory is empty, and the one cause that actually
      // produces it (Firestore rules not deployed, which the client SDK
      // reports as permission-denied and nothing else surfaces) looks
      // identical to having no listings. A read that could not happen must
      // never render as a confirmed-empty result.
      (err) => {
        console.error("[listings] subscription failed", err);
        setLoadError(
          /permission|insufficient/i.test(err.message)
            ? "permission"
            : "unknown"
        );
        setLoaded(true);
      }
    );
    return () => unsub();
  }, [subAccountId]);

  // Which properties are already in the campaign panel. Drives the per-row
  // action so the agent is never invited to add the same property twice.
  useEffect(() => {
    if (!subAccountId) return;
    let active = true;
    void fetch(`/api/sub-accounts/${subAccountId}/marketing/campaigns`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { briefs?: { id: string }[] };
        if (active) setBriefIds(new Set((data.briefs ?? []).map((b) => b.id)));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [subAccountId]);

  // How many inquiries each property has drawn. One fetch for the whole
  // workspace, same shape as the campaign-membership load above.
  useEffect(() => {
    if (!subAccountId) return;
    let active = true;
    void fetch(`/api/sub-accounts/${subAccountId}/listings/inquiry-stats`)
      .then(async (r) => {
        // Leave the state null on failure so the column renders "—" rather
        // than a zero nobody measured.
        if (!r.ok) return;
        const data = (await r.json()) as {
          stats?: Record<string, ListingInquiryStat>;
        };
        if (active) setInquiryStats(data.stats ?? {});
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [subAccountId]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings
      .map((listing) => ({
        listing,
        status: resolveMarketingStatus(listing),
        source: describeListingSource(listing),
      }))
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => {
        if (sourceFilter === "all") return true;
        if (sourceFilter === "mls") return row.source.isFeedSourced;
        return !row.source.isFeedSourced;
      })
      .filter((row) =>
        !q
          ? true
          : [
              row.listing.address,
              row.listing.city,
              row.listing.mlsId,
              row.listing.id,
            ]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
      )
      .sort((a, b) =>
        (a.listing.address || "").localeCompare(b.listing.address || "")
      );
  }, [listings, search, statusFilter, sourceFilter]);

  const statusCounts = useMemo(() => {
    const counts = new Map<ListingMarketingStatus, number>();
    for (const listing of listings) {
      const status = resolveMarketingStatus(listing);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [listings]);

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
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Sync failed.");
      if ((data.listingCount ?? 0) === 0) {
        toast.warning("IDX Broker returned no active listings. Check whether this account has featured listings and whether the expected listings are available through its API. The hosted agent page alone does not confirm API access.");
      } else {
        toast.success(`Synced ${data.listingCount} active listings.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  /**
   * Add an existing property to the campaign panel. Posts the listing's own
   * doc id, which `findCampaignListing()` resolves directly out of the cache
   * — no MLS lookup, so this works identically for off-market records.
   */
  async function handleAddToCampaign(listing: IdxListingDoc) {
    setAddingId(listing.id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/campaigns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mlsId: listing.id }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Could not add this property.");
      setBriefIds((prev) => new Set(prev).add(listing.id));
      toast.success(`${listing.address || "Property"} added to campaigns.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not add this property."
      );
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building className="h-5 w-5" />
            Listings
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every property in this workspace — on the MLS and off it. Pick the
            ones you want to market.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            {feedConnected && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncNow}
                disabled={syncing}
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
            )}
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add off-market property
            </Button>
          </div>
        )}
      </div>

      <FeedStatusCard
        gateOn={gateOn}
        feedConnected={feedConnected}
        cfg={cfg}
        settingsHref={saPath(SUB_ACCOUNT_ROUTES.settings)}
        subAccountId={subAccountId}
      />

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by address, city, or MLS number…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label={`All (${listings.length})`}
          />
          {MARKETING_STATUSES.map((status) => {
            const count = statusCounts.get(status) ?? 0;
            if (count === 0 && statusFilter !== status) return null;
            return (
              <Chip
                key={status}
                active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
                label={`${MARKETING_STATUS_LABELS[status]} (${count})`}
              />
            );
          })}
          <span className="bg-border mx-1 w-px self-stretch" aria-hidden />
          {(
            [
              ["all", "Any source"],
              ["mls", "MLS feed"],
              ["manual", "Off market"],
            ] as const
          ).map(([key, label]) => (
            <Chip
              key={key}
              active={sourceFilter === key}
              onClick={() => setSourceFilter(key)}
              label={label}
            />
          ))}
        </div>
      </div>

      {!loaded ? (
        <div className="bg-muted/50 h-32 animate-pulse rounded-2xl" />
      ) : loadError ? (
        <ListingsLoadError reason={loadError} />
      ) : rows.length === 0 ? (
        <EmptyState
          hasAny={listings.length > 0}
          feedConnected={feedConnected}
          onAdd={isAdmin ? () => setShowAdd(true) : undefined}
          onClearFilters={() => {
            setSearch("");
            setStatusFilter("all");
            setSourceFilter("all");
          }}
        />
      ) : (
        <div className="bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground border-b text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Address</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Source</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Beds/Baths</th>
                <th className="px-4 py-2 text-right">Leads</th>
                <th className="px-4 py-2 text-right">Marketing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ listing, status, source }) => {
                const inCampaigns = briefIds.has(listing.id);
                return (
                  <tr
                    key={listing.id}
                    className="hover:bg-muted/20 border-b last:border-0"
                  >
                    <td className="px-4 py-2">
                      <span className="font-medium">
                        {listing.address || listing.id}
                      </span>
                      {source.isFeedSourced && listing.mlsId && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          MLS #{listing.mlsId}
                        </span>
                      )}
                      <span className="text-muted-foreground block text-xs">
                        {[listing.city, listing.state]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_TONES[status]
                        )}
                      >
                        {MARKETING_STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-2 text-xs">
                      {source.label}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {listing.price
                        ? `$${listing.price.toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="text-muted-foreground px-4 py-2 text-right">
                      {listing.beds} / {listing.baths}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <ListingLeadsCell
                        stat={inquiryStats?.[listing.id] ?? null}
                        loaded={inquiryStats !== null}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {inCampaigns ? (
                        <Link
                          href={saPath(SUB_ACCOUNT_ROUTES.properties)}
                          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          In campaigns
                        </Link>
                      ) : isAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddToCampaign(listing)}
                          disabled={addingId === listing.id}
                        >
                          {addingId === listing.id ? (
                            <>
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              Adding…
                            </>
                          ) : (
                            "Add to campaign"
                          )}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Not marketed
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddOffMarketDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        subAccountId={subAccountId}
        onAdded={(listingId) =>
          setBriefIds((prev) => new Set(prev).add(listingId))
        }
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:bg-muted/70"
      )}
    >
      {label}
    </button>
  );
}

/**
 * The MLS half of the screen. Says by name what is missing rather than
 * rendering a padlock — a workspace with no IDX Broker account is the normal
 * starting state, not an error.
 */
function FeedStatusCard({
  gateOn,
  feedConnected,
  cfg,
  settingsHref,
  subAccountId,
}: {
  gateOn: boolean;
  feedConnected: boolean;
  cfg: IdxConfig | null;
  settingsHref: string;
  subAccountId: string;
}) {
  if (!gateOn) {
    return (
      <div className="bg-card rounded-2xl border border-dashed p-4 text-sm">
        <p className="font-medium">MLS sync is off for this workspace</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Your agency administrator has not enabled IDX Listings here, so
          nothing syncs from the MLS. You can still add off-market properties
          and market them — everything below works without it.
        </p>
      </div>
    );
  }

  if (!feedConnected) {
    return (
      <div className="bg-card rounded-2xl border border-dashed p-4 text-sm">
        <p className="font-medium">No MLS feed connected yet</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Connect this workspace&apos;s own IDX Broker account to pull its MLS
          listings in automatically. Off-market properties you add by hand work
          either way.
        </p>
        <Link
          href={settingsHref}
          className="mt-2 inline-block text-xs font-medium underline-offset-4 hover:underline"
        >
          Connect IDX Broker in Settings
        </Link>
      </div>
    );
  }

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/idx/${subAccountId}`
      : `/idx/${subAccountId}`;

  const syncStatus = cfg?.lastSyncStatus ?? null;
  const resultLabel =
    syncStatus === "success"
      ? `${cfg?.listingCount ?? 0} active listings`
      : syncStatus === "empty"
        ? "0 listings returned"
        : syncStatus === "failed"
          ? "Sync failed"
          : syncStatus === "syncing"
            ? "Sync in progress"
            : "Not tested yet";
  const resultTone =
    syncStatus === "failed"
      ? "text-destructive"
      : syncStatus === "empty"
        ? "text-amber-700 dark:text-amber-400"
        : syncStatus === "success"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-foreground";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs">Connection</p>
          <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
            Connected
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            IDX Broker authorization is saved.
          </p>
        </div>
        <div className="bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs">API result</p>
          <p className={cn("mt-1 text-lg font-semibold", resultTone)}>
            {resultLabel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {cfg?.lastSyncAt
              ? `Last tested ${formatRelativeTime(cfg.lastSyncAt)}.`
              : "Run Sync now to test the feed."}
          </p>
        </div>
        <div className="bg-card flex items-center gap-2 rounded-2xl border p-4">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">Public search page</p>
            <p className="truncate text-xs">{publicUrl}</p>
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
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {syncStatus === "empty" ? (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            IDX Broker is connected, but its listings API returned zero records.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            This does not mean the MLS account is broken. The connected IDX Broker
            account may have no featured listings available to this API response,
            or its Featured IDs configuration may point at a different agent.
            Check IDX Broker&apos;s Featured IDs for the intended agent, then run
            Sync now again.
          </p>
          <Link
            href={`${settingsHref}#mls-feed`}
            className="mt-3 inline-block text-xs font-medium underline-offset-4 hover:underline"
          >
            Open MLS connection settings
          </Link>
        </div>
      ) : null}

      {syncStatus === "failed" && cfg?.lastSyncError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">The last MLS test failed.</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{cfg.lastSyncError}</p>
          <Link
            href={`${settingsHref}#mls-feed`}
            className="mt-3 inline-block text-xs font-medium underline-offset-4 hover:underline"
          >
            Open MLS connection settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({
  hasAny,
  feedConnected,
  onAdd,
  onClearFilters,
}: {
  hasAny: boolean;
  feedConnected: boolean;
  onAdd?: () => void;
  onClearFilters: () => void;
}) {
  // Filtered-to-nothing and genuinely-empty are different problems and need
  // different next actions.
  if (hasAny) {
    return (
      <div className="text-muted-foreground bg-card rounded-2xl border border-dashed p-10 text-center text-sm">
        <p>No property matches these filters.</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onClearFilters}
        >
          Clear filters
        </Button>
      </div>
    );
  }
  return (
    <div className="bg-card rounded-2xl border border-dashed p-10 text-center">
      <h2 className="text-base font-semibold">No properties yet</h2>
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
        {feedConnected
          ? "Your MLS feed has not returned any listings yet — try Sync now. You can also add a property that is not on the MLS."
          : "Add a property that is not on the MLS to start marketing it. Connect an IDX Broker account to pull your MLS listings in automatically."}
      </p>
      {onAdd ? (
        <Button size="sm" className="mt-4" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add off-market property
        </Button>
      ) : (
        // Collaborators cannot add property or connect a feed, so say who can
        // rather than leaving them on a screen with nothing to do.
        <p className="text-muted-foreground mt-4 text-xs">
          Ask a workspace admin to add a property or connect your MLS feed.
        </p>
      )}
    </div>
  );
}

/**
 * Guided entry for property that is not in the MLS feed — pocket listings,
 * coming-soon, probate/as-is, and sold work an agent wants to market.
 *
 * Deliberately has no MLS disclaimer field: an off-market property carries no
 * MLS display rights, and offering the box invites pasting someone else's
 * disclaimer onto a record it does not cover. Listings that need one come
 * from the feed, which carries it already.
 */
function AddOffMarketDialog({
  open,
  onOpenChange,
  subAccountId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subAccountId: string;
  onAdded: (listingId: string) => void;
}) {
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  const canSubmit =
    form.address.trim() && form.city.trim() && form.state.trim();

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/campaigns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mlsId: "",
            address: form.address.trim(),
            city: form.city.trim(),
            state: form.state.trim(),
            zip: form.zip.trim(),
            propertyType: form.propertyType.trim(),
            remarks: form.remarks.trim(),
            marketingStatus: form.marketingStatus,
            price: Number(form.price) || 0,
            beds: Number(form.beds) || 0,
            baths: Number(form.baths) || 0,
            sqft: Number(form.sqft) || 0,
            photos: [],
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        listing?: { id: string };
      };
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Could not add this property.");
      if (data.listing?.id) onAdded(data.listing.id);
      toast.success("Property added.");
      setForm(BLANK_FORM);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not add this property."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add off-market property</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">
          For property that is not in your MLS feed — pocket listings,
          coming-soon, or past work. Saves to your listings and opens a campaign
          draft; nothing is published until you approve it.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="off-address"
            label="Address"
            required
            className="sm:col-span-2"
            value={form.address}
            onChange={(v) => setForm({ ...form, address: v })}
          />
          <Field
            id="off-city"
            label="City"
            required
            value={form.city}
            onChange={(v) => setForm({ ...form, city: v })}
          />
          <Field
            id="off-state"
            label="State"
            required
            value={form.state}
            onChange={(v) => setForm({ ...form, state: v })}
          />
          <Field
            id="off-zip"
            label="ZIP"
            value={form.zip}
            onChange={(v) => setForm({ ...form, zip: v })}
          />
          <div className="space-y-1">
            <Label htmlFor="off-status">Status</Label>
            <select
              id="off-status"
              value={form.marketingStatus}
              onChange={(e) =>
                setForm({
                  ...form,
                  marketingStatus: e.target.value as ListingMarketingStatus,
                })
              }
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {MARKETING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {MARKETING_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <Field
            id="off-price"
            label="Price"
            inputMode="numeric"
            value={form.price}
            onChange={(v) => setForm({ ...form, price: v })}
          />
          <Field
            id="off-type"
            label="Property type"
            value={form.propertyType}
            onChange={(v) => setForm({ ...form, propertyType: v })}
          />
          <Field
            id="off-beds"
            label="Beds"
            inputMode="numeric"
            value={form.beds}
            onChange={(v) => setForm({ ...form, beds: v })}
          />
          <Field
            id="off-baths"
            label="Baths"
            inputMode="numeric"
            value={form.baths}
            onChange={(v) => setForm({ ...form, baths: v })}
          />
          <Field
            id="off-sqft"
            label="Square feet"
            inputMode="numeric"
            value={form.sqft}
            onChange={(v) => setForm({ ...form, sqft: v })}
          />
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="off-remarks">Remarks</Label>
            <Textarea
              id="off-remarks"
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              placeholder="What makes this property worth a buyer's attention?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Adding…
              </>
            ) : (
              "Add property"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  className,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  inputMode?: "numeric";
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * Shown when the listings query FAILED, in place of the empty state.
 *
 * These two look identical from the outside — an empty table — and mean
 * opposite things. An agent who has just saved a property and is then told
 * "No properties yet" will reasonably conclude the save was lost, and go and
 * enter it again. The likeliest cause is also the least guessable: this
 * workspace's Firestore rules have not been deployed, which the client SDK
 * reports only as permission-denied on the stream.
 *
 * So this names the cause and the command that fixes it rather than offering
 * a generic retry. The same failure mode is documented for the voice-calls
 * and website screens; this is the first one that says so on screen.
 */
function ListingsLoadError({ reason }: { reason: string }) {
  return (
    <div className="bg-card rounded-2xl border border-dashed p-10 text-center">
      <h2 className="text-base font-semibold">
        We could not load your properties
      </h2>
      {reason === "permission" ? (
        <>
          <p className="text-muted-foreground mx-auto mt-1 max-w-lg text-sm">
            This workspace is not permitted to read its listings, which almost
            always means this deployment&rsquo;s Firestore rules are out of
            date. Anything you have saved is still there — it cannot be shown
            until the rules are deployed.
          </p>
          <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-xs">
            Whoever runs this deployment can fix it by running{" "}
            <code className="bg-muted rounded px-1 py-0.5">
              firebase deploy --only firestore:rules
            </code>{" "}
            from the project, then reloading this page.
          </p>
        </>
      ) : (
        <p className="text-muted-foreground mx-auto mt-1 max-w-lg text-sm">
          The connection to your listings dropped. Reload the page to try
          again — nothing you have saved is affected.
        </p>
      )}
    </div>
  );
}

/**
 * One property's inquiry count, and how long ago the last one came in.
 *
 * Three states, kept distinct on purpose:
 *
 *   not loaded / failed  → "—"   we have not measured this
 *   loaded, no inquiries → "0"   we measured, and it is zero
 *   loaded, n inquiries  → "n"   plus when the most recent arrived
 *
 * Collapsing the first two is the tempting simplification and the wrong one.
 * "0 leads" on a property an agent has been marketing is a verdict; showing
 * it because a fetch failed would be inventing that verdict. The dash says
 * nothing, which is the honest thing to say when nothing is known.
 */
function ListingLeadsCell({
  stat,
  loaded,
}: {
  stat: ListingInquiryStat | null;
  loaded: boolean;
}) {
  if (!loaded) {
    return (
      <span className="text-muted-foreground/60" title="Not loaded">
        —
      </span>
    );
  }
  if (!stat || stat.count < 1) {
    return <span className="text-muted-foreground">0</span>;
  }
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="font-medium">{stat.count}</span>
      {stat.lastAt !== null && (
        <span className="text-muted-foreground text-[11px]">
          {formatRelativeTime(new Date(stat.lastAt))}
        </span>
      )}
    </span>
  );
}
