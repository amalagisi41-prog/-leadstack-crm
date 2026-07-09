"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  TrendingUp,
  Users,
  Zap,
  ArrowRight,
  Clock,
  Phone,
  Mail,
  MessageSquare,
  Calendar as CalendarIcon,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Bot,
  Upload,
  Download,
  ChevronRight,
  Star,
  PhoneCall,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToDeals } from "@/lib/firestore/deals";
import { subscribeToEvents } from "@/lib/firestore/events";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { subscribeToWebChatSessions } from "@/lib/firestore/web-chat-sessions";
import { formatCurrency, toDate } from "@/lib/format";
import { getStage, type Deal } from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Contact } from "@/types/contacts";
import type { CalendarEvent } from "@/types/events";
import type { Task } from "@/types/tasks";
import type { WebChatSession } from "@/types/web-chat";
import { Button } from "@/components/ui/button";
import { NewDealDialog } from "@/components/pipeline/new-deal-dialog";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { isOnboardingComplete } from "@/lib/onboarding/steps";

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { subAccount, subAccountId, agencyId, saPath } = useSubAccount();
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();

  const onboardingDone = isOnboardingComplete(
    subAccount?.onboardingStepsCompleted,
  );
  useEffect(() => {
    if (subAccount && !onboardingDone) {
      router.replace(saPath("/get-started"));
    }
  }, [subAccount, onboardingDone, router, saPath]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<WebChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !agencyId || !filterReady) return;
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
    const unsubE = subscribeToEvents(scope, setEvents);
    const unsubT = subscribeToTasks(scope, setTasks);
    const unsubS = subscribeToWebChatSessions(subAccountId, setSessions);
    return () => {
      unsubC();
      unsubD();
      unsubE();
      unsubT();
      unsubS();
    };
  }, [user, agencyId, subAccountId, filterReady, territoryFilter]);

  const displayName = (user?.displayName ?? user?.email ?? "").split("@")[0];

  const now = new Date();
  const today = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── KPI calculations ─────────────────────────────────────────────────────
  const currency = deals[0]?.currency ?? "USD";

  const ytdGci = useMemo(() => {
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
    return deals
      .filter((d) => d.stageId === "won")
      .filter((d) => {
        const t = toDate(d.stageChangedAt)?.getTime() ?? 0;
        return t >= yearStart;
      })
      .reduce((s, d) => s + (d.value ?? 0), 0);
  }, [deals]);

  const openDeals = useMemo(
    () => deals.filter((d) => d.stageId !== "won" && d.stageId !== "lost"),
    [deals],
  );
  const pipelineValue = openDeals.reduce((s, d) => s + (d.value ?? 0), 0);

  const leadsThisMonth = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return contacts.filter((c) => {
      const t = toDate(c.createdAt)?.getTime() ?? 0;
      return t >= monthStart;
    }).length;
  }, [contacts]);

  const leadsLastMonth = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return contacts.filter((c) => {
      const t = toDate(c.createdAt)?.getTime() ?? 0;
      return t >= start && t < end;
    }).length;
  }, [contacts]);

  const leadsDelta =
    leadsLastMonth > 0
      ? Math.round(((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100)
      : null;

  // ── Monthly GCI for chart (last 6 months) ───────────────────────────────
  const monthlyGci = useMemo(() => {
    const months: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const label = d.toLocaleString("en-US", { month: "short" });
      const value = deals
        .filter((deal) => deal.stageId === "won")
        .filter((deal) => {
          const t = toDate(deal.stageChangedAt)?.getTime() ?? 0;
          return t >= start && t < end;
        })
        .reduce((s, deal) => s + (deal.value ?? 0), 0);
      months.push({ label, value });
    }
    return months;
  }, [deals]);

  const maxGci = Math.max(1, ...monthlyGci.map((m) => m.value));

  // ── Pipeline snapshot ─────────────────────────────────────────────────────
  const stages = usePipelineStages();
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    const stageValues = new Map<string, number>();
    for (const s of stages) {
      m.set(s.id, 0);
      stageValues.set(s.id, 0);
    }
    for (const d of openDeals) {
      m.set(d.stageId, (m.get(d.stageId) ?? 0) + 1);
      stageValues.set(d.stageId, (stageValues.get(d.stageId) ?? 0) + (d.value ?? 0));
    }
    return { counts: m, values: stageValues };
  }, [openDeals, stages]);

  // ── Today's events ────────────────────────────────────────────────────────
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 86400000;
  const tomorrowEnd = todayEnd + 86400000;

  const todayEvents = useMemo(() => {
    return events
      .filter((e) => {
        const t = toDate(e.startAt)?.getTime() ?? 0;
        return t >= todayStart && t < todayEnd;
      })
      .slice(0, 5);
  }, [events, todayStart, todayEnd]);

  const tomorrowEvents = useMemo(() => {
    return events.filter((e) => {
      const t = toDate(e.startAt)?.getTime() ?? 0;
      return t >= todayEnd && t < tomorrowEnd;
    });
  }, [events, todayEnd, tomorrowEnd]);

  // ── AI Receptionist feed (recent web chat sessions) ───────────────────────
  const recentSessions = sessions.slice(0, 5);

  // ── Daily Success Plan priorities ────────────────────────────────────────
  const priorities = useMemo(() => {
    const items: Priority[] = [];

    // New leads (contacts created in last 24h)
    const oneDayAgo = Date.now() - 86400000;
    const newLeads = contacts.filter((c) => {
      const t = toDate(c.createdAt)?.getTime() ?? 0;
      return t >= oneDayAgo;
    });
    if (newLeads.length > 0) {
      items.push({
        id: "new_leads",
        icon: <Users className="h-4 w-4" />,
        iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40",
        label: `Respond to ${newLeads.length} new lead${newLeads.length !== 1 ? "s" : ""}`,
        href: saPath("/contacts"),
        urgency: "high",
      });
    }

    // Overdue + due-today tasks
    const overdueTasks = tasks.filter((t) => {
      if (t.completed) return false;
      const due = toDate(t.dueAt)?.getTime();
      return due != null && due < todayEnd;
    });
    if (overdueTasks.length > 0) {
      const overdueCount = overdueTasks.filter((t) => {
        const due = toDate(t.dueAt)?.getTime();
        return due != null && due < todayStart;
      }).length;
      items.push({
        id: "tasks",
        icon: <CheckCircle2 className="h-4 w-4" />,
        iconBg: overdueCount > 0
          ? "bg-red-100 text-red-600 dark:bg-red-900/40"
          : "bg-amber-100 text-amber-600 dark:bg-amber-900/40",
        label: overdueCount > 0
          ? `Complete ${overdueTasks.length} task${overdueTasks.length !== 1 ? "s" : ""} (${overdueCount} overdue)`
          : `Complete ${overdueTasks.length} task${overdueTasks.length !== 1 ? "s" : ""} due today`,
        href: saPath("/tasks"),
        urgency: overdueCount > 0 ? "high" : "medium",
      });
    }

    // Warm prospects — contacts at 'contacted' or 'qualified' stage
    const warmStages = new Set(["contacted", "qualified"]);
    const warmDeals = openDeals.filter((d) => warmStages.has(d.stageId));
    if (warmDeals.length > 0) {
      items.push({
        id: "warm_prospects",
        icon: <PhoneCall className="h-4 w-4" />,
        iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40",
        label: `Follow up with ${warmDeals.length} warm prospect${warmDeals.length !== 1 ? "s" : ""}`,
        href: saPath("/pipeline"),
        urgency: "medium",
      });
    }

    // Tomorrow's appointments to confirm
    if (tomorrowEvents.length > 0) {
      items.push({
        id: "confirm_appointments",
        icon: <CalendarIcon className="h-4 w-4" />,
        iconBg: "bg-violet-100 text-violet-600 dark:bg-violet-900/40",
        label: `Confirm ${tomorrowEvents.length} appointment${tomorrowEvents.length !== 1 ? "s" : ""} for tomorrow`,
        href: saPath("/calendar"),
        urgency: "medium",
      });
    }

    // Recently closed deals — suggest requesting reviews
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const recentWins = deals.filter((d) => {
      if (d.stageId !== "won") return false;
      const t = toDate(d.stageChangedAt)?.getTime() ?? 0;
      return t >= sevenDaysAgo;
    });
    if (recentWins.length > 0) {
      items.push({
        id: "request_reviews",
        icon: <Star className="h-4 w-4" />,
        iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900/40",
        label: `Request reviews from ${recentWins.length} recent closing${recentWins.length !== 1 ? "s" : ""}`,
        href: saPath("/contacts"),
        urgency: "low",
      });
    }

    // Active web chat sessions needing attention
    const activeSessions = sessions.filter((s) => s.status === "escalated");
    if (activeSessions.length > 0) {
      items.push({
        id: "escalated_chats",
        icon: <MessageSquare className="h-4 w-4" />,
        iconBg: "bg-red-100 text-red-600 dark:bg-red-900/40",
        label: `${activeSessions.length} escalated chat${activeSessions.length !== 1 ? "s" : ""} need your attention`,
        href: saPath("/ai-agents/web-chat/sessions"),
        urgency: "high",
      });
    }

    // Sort by urgency
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    return items.slice(0, 6);
  }, [contacts, tasks, openDeals, tomorrowEvents, sessions, deals, saPath, todayStart, todayEnd]);

  // ── Next Best Action ──────────────────────────────────────────────────────
  const nextBestAction = useMemo(() => {
    // Escalated chats are highest priority
    const escalated = sessions.filter((s) => s.status === "escalated");
    if (escalated.length > 0) {
      const s = escalated[0];
      const identity = s.capturedName ?? s.capturedEmail ?? s.capturedPhone ?? "A visitor";
      return {
        title: `${identity} needs your help`,
        description: "This chat was escalated by your AI agent. The visitor asked something the AI couldn’t handle.",
        cta: "Open conversation",
        href: saPath(`/ai-agents/web-chat/sessions/${s.id}`),
        accent: "border-red-200 bg-red-50/60 dark:border-red-800/40 dark:bg-red-950/20",
        iconColor: "text-red-600",
      };
    }

    // Newest contact with no deal — highest conversion potential
    const oneDayAgo = Date.now() - 86400000;
    const freshLeads = contacts
      .filter((c) => {
        const t = toDate(c.createdAt)?.getTime() ?? 0;
        return t >= oneDayAgo;
      })
      .filter((c) => !deals.some((d) => d.contactId === c.id));
    if (freshLeads.length > 0) {
      const lead = freshLeads[0];
      const name = lead.name || lead.email || lead.phone || "New lead";
      const source = lead.source ? ` from ${lead.source.replace(/-/g, " ")}` : "";
      return {
        title: `Reach out to ${name}`,
        description: `${name} came in${source} and hasn’t been contacted yet. Speed-to-lead matters — the first agent to respond wins 78% of the time.`,
        cta: "View contact",
        href: saPath(`/contacts/${lead.id}`),
        accent: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20",
        iconColor: "text-emerald-600",
      };
    }

    // Overdue tasks
    const overdue = tasks.filter((t) => {
      if (t.completed) return false;
      const due = toDate(t.dueAt)?.getTime();
      return due != null && due < todayStart;
    });
    if (overdue.length > 0) {
      const task = overdue[0];
      return {
        title: task.title,
        description: "This task is overdue. Completing it keeps your pipeline moving.",
        cta: "View tasks",
        href: saPath("/tasks"),
        accent: "border-amber-200 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20",
        iconColor: "text-amber-600",
      };
    }

    // Warm deal to follow up on
    if (openDeals.length > 0) {
      const oldest = [...openDeals].sort((a, b) => {
        const ta = toDate(a.stageChangedAt)?.getTime() ?? 0;
        const tb = toDate(b.stageChangedAt)?.getTime() ?? 0;
        return ta - tb;
      })[0];
      const contact = contacts.find((c) => c.id === oldest.contactId);
      const name = contact?.name || "A prospect";
      const stage = getStage(oldest.stageId, stages);
      return {
        title: `Follow up with ${name}`,
        description: `This deal has been at "${stage?.label ?? oldest.stageId}" the longest. A quick check-in can move it forward.`,
        cta: "View deal",
        href: saPath("/pipeline"),
        accent: "border-blue-200 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-950/20",
        iconColor: "text-blue-600",
      };
    }

    return null;
  }, [contacts, deals, tasks, sessions, openDeals, stages, saPath, todayStart]);

  // ── Recent contacts table ─────────────────────────────────────────────────
  const recentContacts = useMemo(
    () =>
      [...contacts]
        .sort(
          (a, b) =>
            (toDate(b.createdAt)?.getTime() ?? 0) -
            (toDate(a.createdAt)?.getTime() ?? 0),
        )
        .slice(0, 8),
    [contacts],
  );

  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const isEmpty = !loading && contacts.length === 0 && deals.length === 0;

  if (subAccount && !onboardingDone) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Taking you to setup&hellip;
      </div>
    );
  }

  // ── Stage display names ───────────────────────────────────────────────────
  const stageDisplay: Record<string, { label: string; color: string }> = {
    new: { label: "Inquiry", color: "bg-slate-100 text-slate-600" },
    contacted: { label: "Showing", color: "bg-blue-100 text-blue-700" },
    qualified: { label: "Offer In", color: "bg-violet-100 text-violet-700" },
    proposal: { label: "Contract", color: "bg-amber-100 text-amber-700" },
    won: { label: "Closed", color: "bg-emerald-100 text-emerald-700" },
    lost: { label: "Lost", color: "bg-red-100 text-red-600" },
  };

  return (
    <div className="space-y-5">
      {/* ── Daily Success Plan Header ─────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {today}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            {greeting}
            {displayName ? (
              <span className="font-normal text-muted-foreground">
                , {displayName}
              </span>
            ) : null}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <NewDealDialog contacts={contacts} />
          <Button size="sm" variant="outline" render={<Link href={saPath("/contacts")} />}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Lead
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <GettingStarted saPath={saPath} contacts={contacts} />
      ) : (
        <>
          {/* ── Daily Success Plan ────────────────────────────────────── */}
          {!loading && (priorities.length > 0 || nextBestAction) && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {/* Today's priorities */}
              {priorities.length > 0 && (
                <section className="rounded-2xl border bg-card p-5">
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold">Today&apos;s Priorities</h2>
                    <p className="text-xs text-muted-foreground">
                      Your daily action plan — complete these to stay ahead
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {priorities.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={p.href}
                          className="group flex items-center gap-3 rounded-xl border bg-muted/20 px-3.5 py-3 transition-all hover:bg-muted/40 hover:border-primary/20"
                        >
                          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", p.iconBg)}>
                            {p.icon}
                          </span>
                          <span className="flex-1 text-sm font-medium">{p.label}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Next Best Action */}
              {nextBestAction && (
                <section className={cn("rounded-2xl border p-5", nextBestAction.accent)}>
                  <div className="mb-1 flex items-center gap-2">
                    <Sparkles className={cn("h-4 w-4", nextBestAction.iconColor)} />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Next Best Action
                    </p>
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight">
                    {nextBestAction.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    {nextBestAction.description}
                  </p>
                  <Button size="sm" className="mt-4" render={<Link href={nextBestAction.href} />}>
                    {nextBestAction.cta}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </section>
              )}
            </div>
          )}

          {/* ── KPI Cards ────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="YTD GCI"
              value={loading ? null : formatCurrency(ytdGci, currency)}
              delta={ytdGci > 0 ? "Closed this year" : "No closed deals yet"}
              deltaPositive={ytdGci > 0}
              icon={<TrendingUp className="h-4 w-4" />}
              accentClass="text-emerald-600"
              bgClass="bg-emerald-50"
              href={saPath("/reports")}
            />
            <KpiCard
              label="Active Deals"
              value={loading ? null : formatCurrency(pipelineValue, currency)}
              delta={`${openDeals.length} open deal${openDeals.length !== 1 ? "s" : ""}`}
              deltaPositive={openDeals.length > 0}
              icon={<TrendingUp className="h-4 w-4" />}
              accentClass="text-blue-600"
              bgClass="bg-blue-50"
              href={saPath("/pipeline")}
            />
            <KpiCard
              label="Leads This Month"
              value={loading ? null : String(leadsThisMonth)}
              delta={
                leadsDelta !== null
                  ? `${leadsDelta >= 0 ? "+" : ""}${leadsDelta}% vs last month`
                  : "First month of data"
              }
              deltaPositive={leadsDelta === null || leadsDelta >= 0}
              icon={<Users className="h-4 w-4" />}
              accentClass="text-violet-600"
              bgClass="bg-violet-50"
              href={saPath("/contacts")}
            />
            <KpiCard
              label="AI Receptionist"
              value={loading ? null : String(recentSessions.length)}
              delta={
                recentSessions.length > 0
                  ? `${recentSessions.filter((s) => s.status === "active").length} active sessions`
                  : "No sessions yet"
              }
              deltaPositive={recentSessions.length > 0}
              icon={<Bot className="h-4 w-4" />}
              accentClass="text-amber-600"
              bgClass="bg-amber-50"
              href={saPath("/ai-agents/web-chat/sessions")}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {/* ── Left column ──────────────────────────────────────────── */}
            <div className="space-y-4">
              {/* Pipeline snapshot */}
              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Deals snapshot</h2>
                    <p className="text-xs text-muted-foreground">
                      Active deals by stage
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="gap-1" render={<Link href={saPath("/pipeline")} />}>
                    Open board <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {stages
                    .filter((s) => s.id !== "lost")
                    .slice(0, 5)
                    .map((s) => {
                      const count = stageCounts.counts.get(s.id) ?? 0;
                      const value = stageCounts.values.get(s.id) ?? 0;
                      const display = stageDisplay[s.id] ?? {
                        label: s.label,
                        color: "bg-slate-100 text-slate-600",
                      };
                      return (
                        <Link
                          key={s.id}
                          href={saPath("/pipeline")}
                          className="group flex flex-col items-center rounded-xl border bg-muted/30 p-3 text-center transition-all hover:border-primary/30 hover:bg-muted/50"
                        >
                          <span className="text-2xl font-bold tabular-nums">
                            {count}
                          </span>
                          <span
                            className={cn(
                              "mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                              display.color,
                            )}
                          >
                            {display.label}
                          </span>
                          {value > 0 && (
                            <span className="mt-1 text-[11px] text-muted-foreground">
                              {formatCurrency(value, currency, { compact: true })}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                </div>
              </section>

              {/* Recent contacts table */}
              <section className="rounded-2xl border bg-card">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold">Recent People</h2>
                    <p className="text-xs text-muted-foreground">
                      Latest leads in your database
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="gap-1" render={<Link href={saPath("/contacts")} />}>
                    View all <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-5 py-2.5 font-medium">Name</th>
                        <th className="px-3 py-2.5 font-medium">Contact</th>
                        <th className="px-3 py-2.5 font-medium">Source</th>
                        <th className="px-3 py-2.5 font-medium">Stage</th>
                        <th className="px-3 py-2.5 pr-5 font-medium">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentContacts.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-5 py-8 text-center text-xs text-muted-foreground"
                          >
                            No contacts yet
                          </td>
                        </tr>
                      ) : (
                        recentContacts.map((c) => {
                          const initials = (c.name || c.email || "?")
                            .split(" ")
                            .map((s) => s[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase();
                          const contactDeals = deals.filter(
                            (d) => d.contactId === c.id,
                          );
                          const activeDeal = contactDeals.find(
                            (d) =>
                              d.stageId !== "won" && d.stageId !== "lost",
                          );
                          const stage = activeDeal
                            ? getStage(activeDeal.stageId, stages)
                            : null;
                          const stageDisp = stage
                            ? stageDisplay[stage.id] ?? {
                                label: stage.label,
                                color: "bg-slate-100 text-slate-600",
                              }
                            : null;
                          const addedDays = c.createdAt
                            ? Math.floor(
                                (Date.now() -
                                  (toDate(c.createdAt)?.getTime() ?? 0)) /
                                  86400000,
                              )
                            : null;
                          return (
                            <tr
                              key={c.id}
                              className="border-b last:border-0 hover:bg-muted/30"
                            >
                              <td className="px-5 py-3">
                                <Link
                                  href={saPath(`/contacts/${c.id}`)}
                                  className="flex items-center gap-2.5"
                                >
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/70 to-teal-500/70 text-[10px] font-bold text-white">
                                    {initials}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">
                                      {c.name || "Unnamed"}
                                    </p>
                                    {c.company && (
                                      <p className="truncate text-xs text-muted-foreground">
                                        {c.company}
                                      </p>
                                    )}
                                  </div>
                                </Link>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {c.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {c.phone}
                                    </span>
                                  )}
                                  {!c.phone && c.email && (
                                    <span className="flex items-center gap-1 truncate">
                                      <Mail className="h-3 w-3 shrink-0" />
                                      {c.email}
                                    </span>
                                  )}
                                  {!c.phone && !c.email && "—"}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                {c.source ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600">
                                    {c.source.replace(/-/g, " ")}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    &mdash;
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {stageDisp ? (
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                      stageDisp.color,
                                    )}
                                  >
                                    {stageDisp.label}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    No deal
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3 pr-5 text-xs text-muted-foreground">
                                {addedDays !== null
                                  ? addedDays === 0
                                    ? "Today"
                                    : `${addedDays}d ago`
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* GCI chart */}
              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Monthly GCI</h2>
                    <p className="text-xs text-muted-foreground">
                      Closed commission income &mdash; last 6 months
                    </p>
                  </div>
                </div>
                <div className="flex h-36 items-end gap-2">
                  {monthlyGci.map((m) => {
                    const pct = maxGci > 0 ? (m.value / maxGci) * 100 : 0;
                    const isCurrentMonth = m.label === now.toLocaleString("en-US", { month: "short" });
                    return (
                      <div
                        key={m.label}
                        className="group flex flex-1 flex-col items-center gap-1"
                      >
                        <div className="relative flex w-full flex-col items-center justify-end" style={{ height: "112px" }}>
                          {m.value > 0 && (
                            <span className="mb-1 hidden text-[10px] font-medium text-muted-foreground group-hover:block">
                              {formatCurrency(m.value, currency, { compact: true })}
                            </span>
                          )}
                          <div
                            className={cn(
                              "w-full rounded-t-md transition-all",
                              isCurrentMonth
                                ? "bg-emerald-600"
                                : "bg-emerald-200 group-hover:bg-emerald-400",
                            )}
                            style={{ height: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-[11px]",
                            isCurrentMonth
                              ? "font-semibold text-emerald-700"
                              : "text-muted-foreground",
                          )}
                        >
                          {m.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* ── Right column ─────────────────────────────────────────── */}
            <div className="space-y-4">
              {/* Today's schedule */}
              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Today&apos;s Schedule</h2>
                    <p className="text-xs text-muted-foreground">
                      {todayEvents.length === 0
                        ? "Nothing scheduled"
                        : `${todayEvents.length} appointment${todayEvents.length !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="gap-1" render={<Link href={saPath("/calendar")} />}>
                    <CalendarIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {todayEvents.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <CalendarIcon className="mb-2 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">
                      No appointments today.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      render={<Link href={saPath("/calendar")} />}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add appointment
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-2.5">
                    {todayEvents.map((e) => {
                      const start = toDate(e.startAt);
                      const time = start?.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      });
                      const contactForEvent = e.contactId
                        ? contactById.get(e.contactId)
                        : null;
                      return (
                        <li
                          key={e.id}
                          className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3"
                        >
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <CalendarIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {e.title}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              {time && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {time}
                                </span>
                              )}
                              {contactForEvent && (
                                <span className="truncate">
                                  {contactForEvent.name}
                                </span>
                              )}
                              {e.location && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  {e.location}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* AI Receptionist feed */}
              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">
                      AI Receptionist
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Recent web chat sessions
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="gap-1" render={<Link href={saPath("/ai-agents/web-chat/sessions")} />}>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {recentSessions.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <Bot className="mb-2 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">
                      No sessions yet.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3" render={<Link href={saPath("/ai-agents/web-chat")} />}>
                      Configure Web Chat
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {recentSessions.map((s) => {
                      const identity =
                        s.capturedName ??
                        s.capturedEmail ??
                        s.capturedPhone ??
                        "Anonymous visitor";
                      const statusColor =
                        s.status === "active"
                          ? "text-emerald-600"
                          : s.status === "escalated"
                            ? "text-amber-600"
                            : "text-muted-foreground";
                      const StatusIcon =
                        s.status === "active"
                          ? CheckCircle2
                          : s.status === "escalated"
                            ? AlertCircle
                            : MessageSquare;
                      return (
                        <li key={s.id}>
                          <Link
                            href={saPath(
                              `/ai-agents/web-chat/sessions/${s.id}`,
                            )}
                            className="flex items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/40"
                          >
                            <StatusIcon
                              className={cn("h-4 w-4 shrink-0", statusColor)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {identity}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {s.messageCount} message
                                {s.messageCount !== 1 ? "s" : ""}
                                {s.pageUrl && ` · ${s.pageUrl}`}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "text-[10px] font-medium capitalize",
                                statusColor,
                              )}
                            >
                              {s.status}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Quick actions */}
              <section className="rounded-2xl border bg-card p-5">
                <h2 className="mb-3 text-sm font-semibold">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-2">
                  <QuickAction
                    href={saPath("/contacts")}
                    icon={<Users className="h-4 w-4" />}
                    label="Add Contact"
                    color="bg-emerald-50 text-emerald-600"
                  />
                  <QuickAction
                    href={saPath("/calendar")}
                    icon={<CalendarIcon className="h-4 w-4" />}
                    label="Book Showing"
                    color="bg-blue-50 text-blue-600"
                  />
                  <QuickAction
                    href={saPath("/quotes/new")}
                    icon={<Zap className="h-4 w-4" />}
                    label="New Quote"
                    color="bg-violet-50 text-violet-600"
                  />
                  <QuickAction
                    href={saPath("/broadcasts")}
                    icon={<Mail className="h-4 w-4" />}
                    label="Send Blast"
                    color="bg-amber-50 text-amber-600"
                  />
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Priority {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  href: string;
  urgency: "high" | "medium" | "low";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  delta,
  deltaPositive,
  icon,
  accentClass,
  bgClass,
  href,
}: {
  label: string;
  value: string | null;
  delta: string;
  deltaPositive: boolean;
  icon: React.ReactNode;
  accentClass: string;
  bgClass: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm"
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          bgClass,
          accentClass,
        )}
      >
        {icon}
      </span>
      {value === null ? (
        <div className="mt-4 h-9 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-xs",
          deltaPositive ? "text-emerald-600" : "text-muted-foreground/70",
        )}
      >
        {delta}
      </p>
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  label,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-xl border bg-muted/20 p-3 text-center transition-all hover:bg-muted/40"
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg",
          color,
        )}
      >
        {icon}
      </span>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}

function GettingStarted({
  saPath,
  contacts,
}: {
  saPath: (path: string) => string;
  contacts: Contact[];
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-cyan-500/5 p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
        <Users className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">
        Let&apos;s get your first lead in
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Add a single contact to get started, or upload your full list from
        another CRM.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button render={<Link href={saPath("/contacts")} />}>
          <Users className="mr-1 h-4 w-4" />
          Add your first contact
        </Button>
        <Button variant="outline" render={<Link href={`${saPath("/contacts")}?import=1`} />}>
          <Upload className="mr-1 h-4 w-4" />
          Upload CSV
        </Button>
        <Button variant="ghost" size="sm" render={<a href="/contacts-template.csv" download="leadstack-contacts-template.csv" />}>
          <Download className="mr-1 h-3.5 w-3.5" />
          Download template
        </Button>
      </div>
    </div>
  );
}
