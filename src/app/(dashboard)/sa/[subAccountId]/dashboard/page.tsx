"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  Users,
  TrendingUp,
  Trophy,
  ArrowRight,
  Plus,
  Sparkles,
  GitBranch,
  Clock,
  FileText,
  Mail,
  Phone,
  Upload,
  Download,
  Zap,
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { getFirebaseDb } from "@/lib/firebase/client";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToDeals } from "@/lib/firestore/deals";
import { subscribeToForms } from "@/lib/firestore/forms";
import { formatCurrency, daysSince, toDate } from "@/lib/format";
import { getStage, type Deal } from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Contact } from "@/types/contacts";
import type { AutomationDoc } from "@/types";
import type { LeadForm } from "@/types/forms";
import { Button } from "@/components/ui/button";
import { NewDealDialog } from "@/components/pipeline/new-deal-dialog";
import { LeadsMap } from "@/components/dashboard/leads-map";

export default function DashboardPage() {
  const { user } = useAuth();
  const { subAccount, subAccountId, agencyId, saPath } = useSubAccount();
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [automations, setAutomations] = useState<AutomationDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !agencyId) return;
    // Hold off until the territory filter resolves so scoped collaborators
    // don't trip permission-denied on the contacts/deals listeners (rules
    // aren't filters — see lib/firestore/territory-query.ts). Admins /
    // owners / scoping-off resolve synchronously, so no perceptible delay.
    if (!filterReady) return;
    const scope = { agencyId, subAccountId };
    let dealsReady = false;
    let contactsReady = false;
    const settle = () => {
      if (dealsReady && contactsReady) setLoading(false);
    };
    const unsubC = subscribeToContacts(scope, { territoryFilter }, (l) => {
      setContacts(l);
      contactsReady = true;
      settle();
    });
    const unsubD = subscribeToDeals(scope, { territoryFilter }, (l) => {
      setDeals(l);
      dealsReady = true;
      settle();
    });
    const unsubF = subscribeToForms(scope, setForms);
    const automationsQ = query(
      collection(getFirebaseDb(), "automations"),
      where("subAccountId", "==", subAccountId),
    );
    const unsubA = onSnapshot(automationsQ, (snap) => {
      setAutomations(snap.docs.map((d) => d.data() as AutomationDoc));
    });
    return () => {
      unsubC();
      unsubD();
      unsubF();
      unsubA();
    };
  }, [user, agencyId, subAccountId, filterReady, territoryFilter]);

  const displayName = (user?.displayName ?? user?.email ?? "").split("@")[0];

  const openDeals = useMemo(
    () => deals.filter((d) => d.stageId !== "won" && d.stageId !== "lost"),
    [deals],
  );
  const currency = deals[0]?.currency ?? "USD";
  const pipelineValue = openDeals.reduce((s, d) => s + (d.value || 0), 0);
  const wonThisMonth = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(1);
    cutoff.setHours(0, 0, 0, 0);
    return deals
      .filter((d) => d.stageId === "won")
      .filter((d) => {
        const date = toDate(d.stageChangedAt);
        return date && date.getTime() >= cutoff.getTime();
      })
      .reduce((s, d) => s + (d.value || 0), 0);
  }, [deals]);
  const newContactsThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return contacts.filter((c) => {
      const d = toDate(c.createdAt);
      return d && d.getTime() >= cutoff;
    }).length;
  }, [contacts]);

  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const recentDeals = openDeals.slice(0, 5);
  const recentContacts = [...contacts]
    .sort(
      (a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0),
    )
    .slice(0, 5);

  const stages = usePipelineStages();
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stages) m.set(s.id, 0);
    for (const d of deals) m.set(d.stageId, (m.get(d.stageId) ?? 0) + 1);
    return m;
  }, [deals, stages]);
  const maxStageCount = Math.max(1, ...Array.from(stageCounts.values()));

  const isEmpty = !loading && contacts.length === 0 && deals.length === 0;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const accountContact = subAccount?.accountContact ?? null;
  const hasContact =
    !!accountContact &&
    (!!accountContact.name || !!accountContact.email || !!accountContact.phone);

  return (
    <div className="space-y-6">
      {hasContact && accountContact && (
        <Link
          href={saPath("/dashboard/settings")}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Building2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            Account contact
          </span>
          {accountContact.name && <span>{accountContact.name}</span>}
          {accountContact.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {accountContact.email}
            </span>
          )}
          {accountContact.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {accountContact.phone}
            </span>
          )}
        </Link>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {today}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tighter sm:text-4xl">
            Welcome back
            {displayName ? (
              <>
                , <span className="font-serif font-normal italic">{displayName}</span>
              </>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s moving in your pipeline.
          </p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-2">
            <NewDealDialog contacts={contacts} />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          href={saPath("/pipeline")}
          icon={<Briefcase className="h-4 w-4" />}
          label="Open deals"
              value={String(openDeals.length)}
              hint={`${deals.length - openDeals.length} closed`}
              tone="text-indigo-600 dark:text-indigo-400"
              bg="bg-indigo-500/10"
              loading={loading}
            />
            <StatCard
              href={saPath("/pipeline")}
              icon={<TrendingUp className="h-4 w-4" />}
              label="Pipeline value"
              value={formatCurrency(pipelineValue, currency)}
              hint="Across open stages"
              tone="text-violet-600 dark:text-violet-400"
              bg="bg-violet-500/10"
              loading={loading}
            />
            <StatCard
              href={saPath("/pipeline")}
              icon={<Trophy className="h-4 w-4" />}
              label="Won this month"
              value={formatCurrency(wonThisMonth, currency)}
              hint="Closed-won revenue"
              tone="text-emerald-600 dark:text-emerald-400"
              bg="bg-emerald-500/10"
              loading={loading}
            />
            <StatCard
              href={saPath("/contacts")}
              icon={<Users className="h-4 w-4" />}
              label="New contacts · 7d"
              value={String(newContactsThisWeek)}
              hint={`${contacts.length} total`}
              tone="text-amber-600 dark:text-amber-400"
              bg="bg-amber-500/10"
              loading={loading}
            />
            <StatCard
              href={saPath("/forms")}
              icon={<FileText className="h-4 w-4" />}
              label="Forms"
              value={String(forms.length)}
              hint="Public + embeddable"
              tone="text-sky-600 dark:text-sky-400"
              bg="bg-sky-500/10"
              loading={loading}
            />
            <StatCard
              href={saPath("/automations")}
              icon={<Zap className="h-4 w-4" />}
              label="Automations"
              value={
                subAccount?.automationsPaused
                  ? "Paused"
                  : String(automations.filter((a) => a.enabled).length)
              }
              hint={
                subAccount?.automationsPaused
                  ? `${automations.length} affected`
                  : `${automations.length} total`
              }
              tone={
                subAccount?.automationsPaused
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400"
              }
              bg={
                subAccount?.automationsPaused
                  ? "bg-amber-500/10"
                  : "bg-rose-500/10"
              }
              loading={loading}
            />
          </div>

      <LeadsMap contacts={contacts} deals={deals} />

      {isEmpty ? (
        <GettingStarted />
      ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Pipeline snapshot</h2>
                  <p className="text-xs text-muted-foreground">
                    Deals by stage — click to open the board.
                  </p>
                </div>
                <Button
                  render={<Link href={saPath("/pipeline")} />}
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                >
                  Open <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-2">
                {stages.map((s) => {
                  const count = stageCounts.get(s.id) ?? 0;
                  const pct = (count / maxStageCount) * 100;
                  return (
                    <Link
                      key={s.id}
                      href={saPath("/pipeline")}
                      className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
                    >
                      <span
                        className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium ${s.tone}`}
                      >
                        {s.label}
                      </span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {recentDeals.length > 0 && (
                <>
                  <div className="my-4 border-t" />
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Most recent open deals
                    </h3>
                  </div>
                  <ul className="space-y-1">
                    {recentDeals.map((d) => {
                      const stage = getStage(d.stageId, stages);
                      const c = contactById.get(d.contactId);
                      const days = daysSince(d.stageChangedAt);
                      return (
                        <li key={d.id}>
                          <Link
                            href={saPath("/pipeline")}
                            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/50"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="truncate font-medium">{d.title}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {c?.name ?? "Unknown"} ·{" "}
                                  {formatCurrency(d.value, d.currency)}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {days}d
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stage.tone}`}
                              >
                                {stage.label}
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>

            <div className="space-y-4">
              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Recent contacts</h2>
                    <p className="text-xs text-muted-foreground">
                      Newest leads in your list.
                    </p>
                  </div>
                  <Button
                    render={<Link href={saPath("/contacts")} />}
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                  >
                    View all <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
                {recentContacts.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No contacts yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {recentContacts.map((c) => {
                      const initials = (c.name || c.email || "?")
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase();
                      return (
                        <li key={c.id}>
                          <Link
                            href={saPath(`/contacts/${c.id}`)}
                            className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/50"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400/80 via-violet-400/80 to-pink-400/80 text-[10px] font-semibold text-white">
                              {initials}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">
                                {c.name || "Unnamed"}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {c.email || c.company || "—"}
                              </p>
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {daysSince(c.createdAt)}d
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <h2 className="text-sm font-semibold">Quick actions</h2>
                </div>
                <div className="grid gap-2">
                  <QuickLink
                    href={saPath("/contacts")}
                    icon={<Users className="h-4 w-4" />}
                    title="Add a contact"
                    desc="Log a new lead in 10 seconds"
                  />
                  <NewDealDialog
                    contacts={contacts}
                    trigger={
                      <div className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 transition-all hover:border-primary/40 hover:shadow-sm">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
                          <Briefcase className="h-4 w-4" />
                        </span>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium">Open a deal</p>
                          <p className="text-xs text-muted-foreground">
                            Track a new opportunity
                          </p>
                        </div>
                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    }
                  />
                  <QuickLink
                    href={saPath("/pipeline")}
                    icon={<GitBranch className="h-4 w-4" />}
                    title="Open pipeline"
                    desc="Move deals between stages"
                  />
                </div>
              </section>
            </div>
          </div>
      )}
    </div>
  );
}

function StatCard({
  href,
  icon,
  label,
  value,
  hint,
  tone,
  bg,
  loading,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: string;
  bg: string;
  loading?: boolean;
}) {
  const content = (
    <>
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} ${tone}`}
      >
        {icon}
      </span>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <div className="mt-1 h-8 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</p>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </>
  );

  const baseClass =
    "block rounded-2xl border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm";

  if (href) {
    return (
      <Link href={href} className={baseClass}>
        {content}
      </Link>
    );
  }
  return <div className={baseClass}>{content}</div>;
}

function QuickLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border bg-background p-3 transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
        {icon}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}

function GettingStarted() {
  const { saPath } = useSubAccount();
  return (
    <div className="rounded-2xl border border-dashed bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">
        Let&apos;s get your first lead in
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Add a single contact, or migrate your whole list from another CRM by
        uploading a CSV.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button render={<Link href={saPath("/contacts")} />}>
          <Users className="mr-1 h-4 w-4" />
          Add your first contact
        </Button>
        <Button
          variant="outline"
          render={<Link href={`${saPath("/contacts")}?import=1`} />}
        >
          <Upload className="mr-1 h-4 w-4" />
          Upload CSV
        </Button>
        <Button
          variant="ghost"
          size="sm"
          render={
            <a
              href="/contacts-template.csv"
              download="leadstack-contacts-template.csv"
            />
          }
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          Download template
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Template columns: <code>name, email, phone, company, source, tags</code>
      </p>
    </div>
  );
}
