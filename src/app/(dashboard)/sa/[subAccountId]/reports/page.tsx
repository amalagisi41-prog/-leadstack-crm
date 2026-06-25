"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  Trophy,
  Users,
  Target,
  Calendar as CalendarIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToDeals } from "@/lib/firestore/deals";
import { formatCurrency, toDate } from "@/lib/format";
import {
  AreaChart,
  BarChart,
  DonutChart,
  FunnelChart,
} from "@/components/reports/charts";
import { type Deal } from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Contact } from "@/types/contacts";
import { cn } from "@/lib/utils";

type RangeKey = "7d" | "30d" | "90d" | "all";

const RANGES: { id: RangeKey; label: string; days: number | null }[] = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "all", label: "All time", days: null },
];

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("30d");

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    // Wait for the territory filter to resolve so scoped collaborators
    // get a filtered query (rules-as-filters would reject an unfiltered
    // list — see lib/firestore/territory-query.ts). Resolves synchronously
    // for admins / owners / scoping-off so this gate is invisible to them.
    if (!filterReady) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    let dealsReady = false;
    let contactsReady = false;
    const settle = () => {
      if (dealsReady && contactsReady) setLoading(false);
    };
    const unsubD = subscribeToDeals(scope, { territoryFilter }, (l) => {
      setDeals(l);
      dealsReady = true;
      settle();
    });
    const unsubC = subscribeToContacts(scope, { territoryFilter }, (l) => {
      setContacts(l);
      contactsReady = true;
      settle();
    });
    return () => {
      unsubD();
      unsubC();
    };
  }, [
    user,
    agencyId,
    subAccountId,
    authLoading,
    filterReady,
    territoryFilter,
  ]);

  const rangeDays = RANGES.find((r) => r.id === range)?.days ?? null;
  const rangeCutoff = rangeDays
    ? Date.now() - rangeDays * 24 * 60 * 60 * 1000
    : 0;
  const currency = deals[0]?.currency ?? "USD";

  // Filter to range
  const inRange = useMemo(() => {
    const contactsIn = contacts.filter((c) => {
      if (!rangeDays) return true;
      const d = toDate(c.createdAt);
      return d && d.getTime() >= rangeCutoff;
    });
    const dealsIn = deals.filter((d) => {
      if (!rangeDays) return true;
      const date = toDate(d.createdAt);
      return date && date.getTime() >= rangeCutoff;
    });
    return { contactsIn, dealsIn };
  }, [contacts, deals, rangeDays, rangeCutoff]);

  // KPIs
  const newLeads = inRange.contactsIn.length;
  const openDeals = inRange.dealsIn.filter(
    (d) => d.stageId !== "won" && d.stageId !== "lost",
  );
  const wonDeals = inRange.dealsIn.filter((d) => d.stageId === "won");
  const lostDeals = inRange.dealsIn.filter((d) => d.stageId === "lost");
  const openValue = openDeals.reduce((s, d) => s + (d.value || 0), 0);
  const wonValue = wonDeals.reduce((s, d) => s + (d.value || 0), 0);
  const avgDeal =
    wonDeals.length > 0 ? wonValue / wonDeals.length : 0;
  const conversion =
    wonDeals.length + lostDeals.length > 0
      ? Math.round(
          (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100,
        )
      : 0;

  // Pipeline funnel (all deals, current state — not filtered, since the
  // funnel is a "right now" view, not a historical one)
  const stages = usePipelineStages();
  const funnelData = useMemo(() => {
    const counts = new Map<string, number>();
    const values = new Map<string, number>();
    for (const s of stages) {
      counts.set(s.id, 0);
      values.set(s.id, 0);
    }
    for (const d of deals) {
      counts.set(d.stageId, (counts.get(d.stageId) ?? 0) + 1);
      values.set(
        d.stageId,
        (values.get(d.stageId) ?? 0) + (d.value || 0),
      );
    }
    const stageTones: Record<string, string> = {
      new: "bg-slate-500",
      contacted: "bg-blue-500",
      qualified: "bg-indigo-500",
      proposal: "bg-amber-500",
      won: "bg-emerald-500",
      lost: "bg-rose-500",
    };
    return stages.map((s) => ({
      label: s.label,
      value: counts.get(s.id) ?? 0,
      secondary: formatCurrency(values.get(s.id) ?? 0, currency),
      tone: stageTones[s.id],
    }));
  }, [deals, currency, stages]);

  // Deals won over time — bucketed daily over the selected range
  const wonTimeline = useMemo(() => {
    const buckets = bucketDaily(rangeDays ?? 30);
    const byDay = new Map<string, number>();
    for (const b of buckets) byDay.set(b.key, 0);
    for (const d of wonDeals) {
      const date = toDate(d.stageChangedAt) ?? toDate(d.createdAt);
      if (!date) continue;
      const key = dayKey(date);
      if (byDay.has(key)) {
        byDay.set(key, (byDay.get(key) ?? 0) + (d.value || 0));
      }
    }
    return buckets.map((b) => ({ x: b.label, y: byDay.get(b.key) ?? 0 }));
  }, [wonDeals, rangeDays]);

  // Contacts added over time
  const leadsTimeline = useMemo(() => {
    const buckets = bucketDaily(rangeDays ?? 30);
    const byDay = new Map<string, number>();
    for (const b of buckets) byDay.set(b.key, 0);
    for (const c of inRange.contactsIn) {
      const date = toDate(c.createdAt);
      if (!date) continue;
      const key = dayKey(date);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    return buckets.map((b) => ({ x: b.label, y: byDay.get(b.key) ?? 0 }));
  }, [inRange.contactsIn, rangeDays]);

  // Contacts by source (within range)
  const sourceData = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of inRange.contactsIn) {
      const key = c.source || "other";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    const colors: Record<string, string> = {
      website: "rgb(59 130 246)",
      referral: "rgb(16 185 129)",
      ads: "rgb(245 158 11)",
      other: "rgb(139 92 246)",
      "": "rgb(148 163 184)",
    };
    return Array.from(m.entries())
      .map(([label, value]) => ({
        label: label || "Unspecified",
        value,
        color: colors[label] ?? "rgb(148 163 184)",
      }))
      .sort((a, b) => b.value - a.value);
  }, [inRange.contactsIn]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Live analytics across your contacts and pipeline.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border bg-muted/30 p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                range === r.id
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <PageSkeleton />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon={<Users className="h-4 w-4" />}
              label="New leads"
              value={String(newLeads)}
              hint="In selected range"
              tone="text-indigo-600 dark:text-indigo-400"
              bg="bg-indigo-500/10"
            />
            <Kpi
              icon={<Trophy className="h-4 w-4" />}
              label="Won revenue"
              value={formatCurrency(wonValue, currency)}
              hint={`${wonDeals.length} deal${wonDeals.length === 1 ? "" : "s"} closed`}
              tone="text-emerald-600 dark:text-emerald-400"
              bg="bg-emerald-500/10"
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              label="Avg deal size"
              value={formatCurrency(avgDeal, currency)}
              hint={
                wonDeals.length === 0
                  ? "No wins yet"
                  : `Across ${wonDeals.length} win${wonDeals.length === 1 ? "" : "s"}`
              }
              tone="text-violet-600 dark:text-violet-400"
              bg="bg-violet-500/10"
            />
            <Kpi
              icon={<Target className="h-4 w-4" />}
              label="Win rate"
              value={`${conversion}%`}
              hint={`${wonDeals.length} won · ${lostDeals.length} lost`}
              tone="text-amber-600 dark:text-amber-400"
              bg="bg-amber-500/10"
            />
          </div>

          {/* Charts row 1 */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Pipeline funnel</h2>
                  <p className="text-xs text-muted-foreground">
                    Current deals by stage · open + closed
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {formatCurrency(openValue, currency)} open
                </span>
              </div>
              <FunnelChart data={funnelData} />
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Leads by source</h2>
                  <p className="text-xs text-muted-foreground">
                    In selected range
                  </p>
                </div>
              </div>
              {sourceData.length === 0 ? (
                <EmptyHint text="No contacts in range." />
              ) : (
                <DonutChart data={sourceData} />
              )}
            </section>
          </div>

          {/* Charts row 2 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Won revenue</h2>
                  <p className="text-xs text-muted-foreground">
                    Daily · {formatCurrency(wonValue, currency)} total
                  </p>
                </div>
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              {wonValue === 0 ? (
                <EmptyHint text="No wins in this range yet." />
              ) : (
                <AreaChart data={wonTimeline} tone="emerald" />
              )}
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">New leads</h2>
                  <p className="text-xs text-muted-foreground">
                    Daily · {newLeads} total
                  </p>
                </div>
              </div>
              {newLeads === 0 ? (
                <EmptyHint text="No new contacts in this range." />
              ) : (
                <BarChart data={leadsTimeline} tone="indigo" />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} ${tone}`}>
        {icon}
      </span>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/30" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl bg-muted/30" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted/30" />
      </div>
    </div>
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bucketDaily(days: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({
      key: dayKey(d),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }
  return out;
}
