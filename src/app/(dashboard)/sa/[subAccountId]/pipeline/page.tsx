"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToDeals } from "@/lib/firestore/deals";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { formatCurrency } from "@/lib/format";
import { PIPELINE_STAGES, type Deal } from "@/types/deals";
import type { Contact } from "@/types/contacts";
import type { TerritoryDoc } from "@/types";
import { Button } from "@/components/ui/button";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { NewDealDialog } from "@/components/pipeline/new-deal-dialog";
import {
  EMPTY_FILTERS,
  PipelineFilters,
  hasActiveFilters,
  type PipelineFilterState,
} from "@/components/pipeline/pipeline-filters";

export default function PipelinePage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, subAccount, isAdmin } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PipelineFilterState>(EMPTY_FILTERS);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    // Hold the subscribe until the territory filter resolves for
    // collaborators — without this, the first frame would fetch every
    // deal in the sub-account before the listener was re-issued with
    // the territory `in` clause.
    if (!filterReady) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    let dealsReady = false;
    let contactsReady = false;
    const settle = () => {
      if (dealsReady && contactsReady) setLoading(false);
    };
    const unsubDeals = subscribeToDeals(
      scope,
      { territoryFilter },
      (list) => {
        setDeals(list);
        dealsReady = true;
        settle();
      },
      (err) => {
        console.error("[pipeline] deals listener error", err);
        // Don't hang on the skeleton if the listener fails.
        dealsReady = true;
        settle();
      },
    );
    const unsubContacts = subscribeToContacts(
      scope,
      { territoryFilter },
      (list) => {
        setContacts(list);
        contactsReady = true;
        settle();
      },
      (err) => {
        console.error("[pipeline] contacts listener error", err);
        contactsReady = true;
        settle();
      },
    );
    return () => {
      unsubDeals();
      unsubContacts();
    };
  }, [
    user,
    agencyId,
    subAccountId,
    authLoading,
    filterReady,
    territoryFilter,
  ]);

  // Territories list — only subscribe when scoping is on. Drives the
  // pipeline territory filter chips + the deal-card territory labels.
  useEffect(() => {
    if (!scopingOn || !subAccountId) {
      setTerritories([]);
      return;
    }
    const unsub = subscribeToTerritories(
      subAccountId,
      (list) => setTerritories(list),
      (err) => console.error("[pipeline] territories listener error", err),
    );
    return () => unsub();
  }, [scopingOn, subAccountId]);

  // contactsById is needed for the country filter (deals don't carry
  // country directly — we resolve it via the contact lookup).
  const contactsById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  // Country options only include countries that have at least one deal,
  // so the dropdown isn't 200 entries long when most are zero.
  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    for (const d of deals) {
      const c = contactsById.get(d.contactId);
      if (c?.country) set.add(c.country);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [deals, contactsById]);

  // Apply every active filter to the raw deals list. Filtered deals drive
  // both the board AND the stat cards, so "Won this view" actually means
  // "won within the current filter".
  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (filters.stages.length > 0 && !filters.stages.includes(d.stageId)) {
        return false;
      }
      if (
        filters.priorities.length > 0 &&
        !filters.priorities.includes(d.priority)
      ) {
        return false;
      }
      const value = d.value ?? 0;
      if (filters.minValue !== null && value < filters.minValue) return false;
      if (filters.maxValue !== null && value > filters.maxValue) return false;
      if (filters.countries.length > 0) {
        const c = contactsById.get(d.contactId);
        if (!c?.country || !filters.countries.includes(c.country)) return false;
      }
      if (filters.territories.length > 0) {
        if (!d.territoryId || !filters.territories.includes(d.territoryId)) {
          return false;
        }
      }
      return true;
    });
  }, [deals, filters, contactsById]);

  const openDeals = useMemo(
    () =>
      filteredDeals.filter(
        (d) => d.stageId !== "won" && d.stageId !== "lost",
      ),
    [filteredDeals],
  );
  const wonTotal = useMemo(
    () =>
      filteredDeals
        .filter((d) => d.stageId === "won")
        .reduce((sum, d) => sum + (d.value || 0), 0),
    [filteredDeals],
  );
  const openTotal = useMemo(
    () => openDeals.reduce((sum, d) => sum + (d.value || 0), 0),
    [openDeals],
  );
  const currency = deals[0]?.currency ?? "USD";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Drag deals across stages. Your team sees every move in real time.
          </p>
        </div>
        <NewDealDialog contacts={contacts} />
      </div>

      {!loading && deals.length > 0 && (
        <PipelineFilters
          filters={filters}
          onChange={setFilters}
          availableCountries={availableCountries}
          availableTerritories={territories}
          showTerritoryFilters={scopingOn && isAdmin}
        />
      )}

      {!loading && deals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Open deals" value={String(openDeals.length)} />
          <StatCard
            label="Open pipeline value"
            value={formatCurrency(openTotal, currency)}
          />
          <StatCard
            label="Won this view"
            value={formatCurrency(wonTotal, currency)}
            tone="text-emerald-600 dark:text-emerald-400"
          />
        </div>
      )}

      {loading ? (
        <BoardSkeleton />
      ) : deals.length === 0 ? (
        <EmptyState hasContacts={contacts.length > 0} contacts={contacts} />
      ) : filteredDeals.length === 0 && hasActiveFilters(filters) ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No deals match the current filters.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="mt-3"
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <PipelineBoard
          deals={filteredDeals}
          contacts={contacts}
          territories={territories}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${tone ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((s) => (
        <div
          key={s.id}
          className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted/30 p-3"
        >
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border bg-background"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  hasContacts,
  contacts,
}: {
  hasContacts: boolean;
  contacts: Contact[];
}) {
  const { saPath } = useSubAccount();
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <GitBranch className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-base font-semibold">No deals yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasContacts
          ? "Create your first deal to start tracking opportunities."
          : "Add a contact first, then open your first deal against them."}
      </p>
      <div className="mt-6 flex justify-center">
        {hasContacts ? (
          <NewDealDialog contacts={contacts} />
        ) : (
          <Button render={<Link href={saPath("/contacts")} />}>
            Go to Contacts
          </Button>
        )}
      </div>
    </div>
  );
}
