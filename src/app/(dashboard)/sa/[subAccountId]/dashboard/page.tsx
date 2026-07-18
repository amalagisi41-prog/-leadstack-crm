"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  PhoneCall,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToDeals } from "@/lib/firestore/deals";
import { subscribeToEvents } from "@/lib/firestore/events";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { subscribeToWebChatSessions } from "@/lib/firestore/web-chat-sessions";
import { toDate } from "@/lib/format";
import { getStage, type Deal } from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Contact } from "@/types/contacts";
import type { CalendarEvent } from "@/types/events";
import type { Task } from "@/types/tasks";
import type { WebChatSession } from "@/types/web-chat";
import { Button } from "@/components/ui/button";
import { NewDealDialog } from "@/components/pipeline/new-deal-dialog";
import { cn } from "@/lib/utils";
import { isOnboardingComplete, ONBOARDING_STEPS } from "@/lib/onboarding/steps";
import { computeOnboardingState } from "@/lib/onboarding/state-machine";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALLED_AFTER_MS = 7 * DAY_MS;

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

    setLoading(true);

    const scope = { agencyId, subAccountId };
    let contactsReady = false;
    let dealsReady = false;
    let eventsReady = false;
    let tasksReady = false;
    let sessionsReady = false;

    const settle = () => {
      if (
        contactsReady &&
        dealsReady &&
        eventsReady &&
        tasksReady &&
        sessionsReady
      ) {
        setLoading(false);
      }
    };

    const unsubC = subscribeToContacts(scope, { territoryFilter }, (list) => {
      setContacts(list);
      contactsReady = true;
      settle();
    });
    const unsubD = subscribeToDeals(scope, { territoryFilter }, (list) => {
      setDeals(list);
      dealsReady = true;
      settle();
    });
    const unsubE = subscribeToEvents(scope, (list) => {
      setEvents(list);
      eventsReady = true;
      settle();
    });
    const unsubT = subscribeToTasks(scope, (list) => {
      setTasks(list);
      tasksReady = true;
      settle();
    });
    const unsubS = subscribeToWebChatSessions(subAccountId, (list) => {
      setSessions(list);
      sessionsReady = true;
      settle();
    });

    return () => {
      unsubC();
      unsubD();
      unsubE();
      unsubT();
      unsubS();
    };
  }, [user, agencyId, subAccountId, filterReady, territoryFilter]);

  const now = new Date();
  const today = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const nowMs = now.getTime();

  const displayName =
    user?.displayName?.trim() ||
    user?.email?.split("@")[0] ||
    "there";

  const workspaceName = subAccount?.name?.trim() || "your workspace";

  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const todayEnd = todayStart + DAY_MS;
  const tomorrowEnd = todayEnd + DAY_MS;

  const contactById = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const contact of contacts) map.set(contact.id, contact);
    return map;
  }, [contacts]);

  const stages = usePipelineStages();
  const openDeals = useMemo(
    () => deals.filter((deal) => deal.stageId !== "won" && deal.stageId !== "lost"),
    [deals],
  );

  const todayEvents = useMemo(
    () =>
      events
        .filter((event) => {
          const time = toDate(event.startAt)?.getTime() ?? 0;
          return time >= todayStart && time < todayEnd;
        })
        .slice(0, 4),
    [events, todayStart, todayEnd],
  );

  const tomorrowEvents = useMemo(
    () =>
      events.filter((event) => {
        const time = toDate(event.startAt)?.getTime() ?? 0;
        return time >= todayEnd && time < tomorrowEnd;
      }),
    [events, todayEnd, tomorrowEnd],
  );

  // Each person's daily priorities reflect their own assigned tasks, not
  // the whole team's — same "Mine" default as the Tasks page and the
  // sidebar badge.
  const overdueTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (task.completed) return false;
        if ((task.assignedToUid ?? task.createdByUid) !== user?.uid) return false;
        const due = toDate(task.dueAt)?.getTime();
        return due != null && due < todayEnd;
      }),
    [tasks, todayEnd, user],
  );

  const dueTodayTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (task.completed) return false;
        if ((task.assignedToUid ?? task.createdByUid) !== user?.uid) return false;
        const due = toDate(task.dueAt)?.getTime();
        return due != null && due >= todayStart && due < todayEnd;
      }),
    [tasks, todayStart, todayEnd, user],
  );

  const warmDeals = useMemo(
    () =>
      openDeals.filter((deal) =>
        new Set(["contacted", "qualified"]).has(deal.stageId),
      ),
    [openDeals],
  );

  const stalledDeals = useMemo(
    () =>
      openDeals.filter((deal) => {
        if (deal.stageId === "new") return false;
      const changed = toDate(deal.stageChangedAt)?.getTime() ?? 0;
        return changed > 0 && nowMs - changed >= STALLED_AFTER_MS;
    }),
    [openDeals, nowMs],
  );

  const escalatedSessions = useMemo(
    () => sessions.filter((session) => session.status === "escalated"),
    [sessions],
  );

  const newLeads = useMemo(() => {
    const cutoff = nowMs - DAY_MS;
    return contacts.filter((contact) => {
      const created = toDate(contact.createdAt)?.getTime() ?? 0;
      return created >= cutoff;
    });
  }, [contacts, nowMs]);

  const isWorkspaceEmpty =
    contacts.length === 0 &&
    deals.length === 0 &&
    tasks.length === 0 &&
    events.length === 0 &&
    sessions.length === 0;

  // Single source of truth for "what's the next setup step" — shared with
  // the onboarding wizard's resume logic and the /onboarding API's
  // next_recommended_action, so this card can never drift out of sync with
  // either of those.
  const onboardingState = useMemo(
    () => computeOnboardingState(subAccount?.onboardingStepsCompleted),
    [subAccount?.onboardingStepsCompleted],
  );
  const nextOnboardingStep = onboardingState.nextRecommendedAction
    ? ONBOARDING_STEPS.find(
        (step) => step.id === onboardingState.nextRecommendedAction!.id,
      )
    : undefined;
  const onboardingProgress = onboardingState.totalSteps
    ? Math.round(
        (onboardingState.completedCount / onboardingState.totalSteps) * 100,
      )
    : 0;

  const nextBestAction = useMemo<NextBestAction>(() => {
    const currentNow = new Date(nowMs);

    const escalated = escalatedSessions[0];
    if (escalated) {
      const identity =
        escalated.capturedName ??
        escalated.capturedEmail ??
        escalated.capturedPhone ??
        "A visitor";
      const touchedAt =
        toDate(escalated.updatedAt) ?? toDate(escalated.createdAt);
      return {
        title: `${identity} needs a reply`,
        description:
          "Your AI assistant escalated this conversation. A quick human reply can keep the lead warm.",
        waitingLabel: touchedAt
          ? `Waiting ${formatElapsed(touchedAt, currentNow)}`
          : "Waiting now",
        recommendedAction: "Reply now and keep the conversation moving.",
        accentClass:
          "border-red-200 bg-red-50/60 dark:border-red-800/40 dark:bg-red-950/20",
        icon: <AlertCircle className="h-4 w-4 text-red-600" />,
        contactLabel: identity,
        primary: {
          label: "Complete",
          href: saPath(`/ai-agents/web-chat/sessions/${escalated.id}`),
        },
        secondary: {
          label: "Message",
          href: saPath(`/ai-agents/web-chat/sessions/${escalated.id}`),
        },
        tertiary: {
          label: "Schedule",
          href: saPath("/calendar"),
        },
      };
    }

    const freshLead = newLeads.find(
      (contact) => !deals.some((deal) => deal.contactId === contact.id),
    );
    if (freshLead) {
      const createdAt = toDate(freshLead.createdAt);
      const source = freshLead.source ? freshLead.source.replace(/-/g, " ") : "new inquiry";
      return {
        title: `${freshLead.name || freshLead.email || "New lead"} is waiting`,
        description: `A ${source} just landed and has no deal yet. The first reply keeps the momentum with you.`,
        waitingLabel: createdAt
          ? `Waiting ${formatElapsed(createdAt, currentNow)}`
          : "Waiting now",
        recommendedAction: "Send a quick intro and offer a time to connect.",
        accentClass:
          "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20",
        icon: <Users className="h-4 w-4 text-emerald-600" />,
        contactLabel: freshLead.name || freshLead.email || freshLead.phone || "Lead",
        primary: {
          label: "Complete",
          href: saPath(`/contacts/${freshLead.id}`),
        },
        secondary: {
          label: "Message",
          href: saPath(`/contacts/${freshLead.id}`),
        },
        tertiary: {
          label: "Schedule",
          href: saPath("/calendar"),
        },
      };
    }

    const overdue = overdueTasks[0];
    if (overdue) {
      const contact = overdue.contactId ? contactById.get(overdue.contactId) : null;
      const dueAt = toDate(overdue.dueAt);
      return {
        title: overdue.title,
        description:
          "This task is overdue. Finishing it will keep the next client move in motion.",
        waitingLabel: dueAt
          ? `Due ${formatElapsed(dueAt, currentNow)} ago`
          : "Due now",
        recommendedAction: "Complete the task and clear the path forward.",
        accentClass:
          "border-amber-200 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20",
        icon: <CheckCircle2 className="h-4 w-4 text-amber-600" />,
        contactLabel: contact?.name ?? "Task",
        primary: {
          label: "Complete",
          href: saPath("/tasks"),
        },
        secondary: {
          label: "Message",
          href: contact ? saPath(`/contacts/${contact.id}`) : saPath("/tasks"),
        },
        tertiary: {
          label: "Schedule",
          href: saPath("/calendar"),
        },
      };
    }

    const stalled = stalledDeals[0];
    if (stalled) {
      const contact = contactById.get(stalled.contactId);
      const stage = getStage(stalled.stageId, stages);
      const stalledSince = toDate(stalled.stageChangedAt);
      return {
        title: `${contact?.name ?? "A client journey"} has stalled`,
        description: `This deal has been sitting in ${stage.label.toLowerCase()} longer than it should.`,
        waitingLabel: stalledSince
          ? `Stalled ${formatElapsed(stalledSince, currentNow)}`
          : "Stalled for a while",
        recommendedAction: "Nudge the journey and ask for the next step.",
        accentClass:
          "border-blue-200 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-950/20",
        icon: <PhoneCall className="h-4 w-4 text-blue-600" />,
        contactLabel: contact?.name ?? stage.label,
        primary: {
          label: "Complete",
          href: saPath("/pipeline"),
        },
        secondary: {
          label: "Message",
          href: contact ? saPath(`/contacts/${contact.id}`) : saPath("/pipeline"),
        },
        tertiary: {
          label: "Schedule",
          href: saPath("/calendar"),
        },
      };
    }

    if (isWorkspaceEmpty) {
      return {
        title: "No leads yet",
        description:
          "Import contacts or activate Lead Capture so the next inquiry lands here automatically.",
        waitingLabel: "Ready when you are",
        recommendedAction: "Turn on the first capture flow.",
        accentClass:
          "border-slate-200 bg-slate-50/80 dark:border-slate-800/60 dark:bg-slate-950/20",
        icon: <Sparkles className="h-4 w-4 text-slate-600" />,
        contactLabel: null,
        primary: {
          label: "Complete",
          href: saPath("/forms"),
        },
        secondary: {
          label: "Message",
          href: saPath("/contacts?import=1"),
        },
        tertiary: {
          label: "Schedule",
          href: saPath("/calendar"),
        },
      };
    }

    return {
      title: "You’re caught up",
      description:
        "Nothing urgent is waiting right now. Keep your capture systems live so the next lead appears here first.",
      waitingLabel: "No action waiting",
      recommendedAction: "Review your lead capture and keep the system warm.",
      accentClass:
        "border-slate-200 bg-slate-50/80 dark:border-slate-800/60 dark:bg-slate-950/20",
      icon: <Sparkles className="h-4 w-4 text-slate-600" />,
      contactLabel: null,
      primary: {
        label: "Complete",
        href: saPath("/forms"),
      },
      secondary: {
        label: "Message",
        href: saPath("/contacts"),
      },
      tertiary: {
        label: "Schedule",
        href: saPath("/calendar"),
      },
    };
  }, [
    contactById,
    deals,
    escalatedSessions,
    isWorkspaceEmpty,
    newLeads,
    nowMs,
    overdueTasks,
    saPath,
    stages,
    stalledDeals,
  ]);

  const priorities = useMemo<TodayPriority[]>(() => {
    return [
      {
        id: "new-leads",
        label: "New leads",
        description: "Captured in the last 24 hours",
        count: newLeads.length,
        href: saPath("/contacts"),
        icon: <Users className="h-4 w-4" />,
        iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40",
      },
      {
        id: "replies",
        label: "Replies needing attention",
        description: "Escalated chats waiting for a human reply",
        count: escalatedSessions.length,
        href: saPath("/ai-agents/web-chat/sessions"),
        icon: <AlertCircle className="h-4 w-4" />,
        iconBg: "bg-red-100 text-red-600 dark:bg-red-900/40",
      },
      {
        id: "follow-ups",
        label: "Follow-ups due",
        description: "Overdue tasks and warm deals ready to move",
        count: overdueTasks.length + warmDeals.length,
        href: saPath("/tasks"),
        icon: <PhoneCall className="h-4 w-4" />,
        iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40",
      },
      {
        id: "appointments",
        label: "Appointments",
        description: "Meetings scheduled for today",
        count: todayEvents.length,
        href: saPath("/calendar"),
        icon: <CalendarIcon className="h-4 w-4" />,
        iconBg: "bg-violet-100 text-violet-600 dark:bg-violet-900/40",
      },
      {
        id: "tasks",
        label: "Tasks",
        description: "Open tasks due today or earlier",
        count: overdueTasks.length + dueTodayTasks.length,
        href: saPath("/tasks"),
        icon: <CheckCircle2 className="h-4 w-4" />,
        iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900/40",
      },
      {
        id: "stalled-journeys",
        label: "Stalled client journeys",
        description: "Deals that have gone quiet for too long",
        count: stalledDeals.length,
        href: saPath("/pipeline"),
        icon: <Bot className="h-4 w-4" />,
        iconBg: "bg-slate-100 text-slate-600 dark:bg-slate-800/80",
      },
    ];
  }, [
    dueTodayTasks.length,
    escalatedSessions.length,
    newLeads.length,
    overdueTasks.length,
    saPath,
    stalledDeals.length,
    todayEvents.length,
    warmDeals.length,
  ]);

  if (subAccount && !onboardingDone) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Taking you to setup&hellip;
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            {today}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {displayName}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {workspaceName === "your workspace"
              ? "Your workspace is ready for today’s work."
              : `${workspaceName} is ready for the next move. Keep the day focused on leads, follow-up, and appointments.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NewDealDialog contacts={contacts} />
          <Button size="sm" variant="outline" render={<Link href={saPath("/contacts")} />}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Lead
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          {!onboardingDone && (
            <SetupProgressCard
              progress={onboardingProgress}
              nextStep={nextOnboardingStep}
              saPath={saPath}
            />
          )}

          {isWorkspaceEmpty ? (
            <EmptyWorkspaceState saPath={saPath} />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
              <div className="space-y-4">
                <NextBestActionCard action={nextBestAction} />
                <TodayPrioritiesCard priorities={priorities} />
              </div>

              <div className="space-y-4">
                <ScheduleCard
                  todayEvents={todayEvents}
                  tomorrowCount={tomorrowEvents.length}
                  contactById={contactById}
                  saPath={saPath}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface NextBestAction {
  title: string;
  description: string;
  waitingLabel: string;
  recommendedAction: string;
  accentClass: string;
  icon: ReactNode;
  contactLabel: string | null;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  tertiary: { label: string; href: string };
}

interface TodayPriority {
  id: string;
  label: string;
  description: string;
  count: number;
  href: string;
  icon: ReactNode;
  iconBg: string;
}

function LoadingState() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
      <div className="space-y-4">
        <div className="rounded-2xl border bg-card p-5">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-6 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <div className="h-10 animate-pulse rounded-xl bg-muted" />
            <div className="h-10 animate-pulse rounded-xl bg-muted" />
            <div className="h-10 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-16 animate-pulse rounded-xl bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border bg-card p-5">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-14 animate-pulse rounded-xl bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NextBestActionCard({
  action,
}: {
  action: NextBestAction;
}) {
  return (
    <section className={cn("rounded-2xl border p-5", action.accentClass)}>
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Next best action
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{action.title}</h2>
            {action.icon}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {action.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border bg-background/70 px-3 py-1 font-medium text-foreground">
              {action.contactLabel ? `Contact: ${action.contactLabel}` : "No contact assigned"}
            </span>
            <span className="rounded-full border bg-background/70 px-3 py-1 font-medium text-foreground">
              {action.waitingLabel}
            </span>
            <span className="rounded-full border bg-background/70 px-3 py-1 font-medium text-foreground">
              Recommend: {action.recommendedAction}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:min-w-40">
          <Button size="sm" render={<Link href={action.primary.href} />}>
            {action.primary.label}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" render={<Link href={action.secondary.href} />}>
            {action.secondary.label}
          </Button>
          <Button size="sm" variant="ghost" render={<Link href={action.tertiary.href} />}>
            {action.tertiary.label}
          </Button>
        </div>
      </div>
    </section>
  );
}

function TodayPrioritiesCard({
  priorities,
}: {
  priorities: TodayPriority[];
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">Today&apos;s priorities</h2>
        <p className="text-xs text-muted-foreground">
          The six signals that tell you what to do next
        </p>
      </div>
      <ul className="space-y-2.5">
        {priorities.map((priority) => (
          <li key={priority.id}>
            <Link
              href={priority.href}
              className="group flex items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3 transition-all hover:border-primary/20 hover:bg-muted/40"
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  priority.iconBg,
                )}
              >
                {priority.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{priority.label}</p>
                  {priority.count === 0 && (
                    <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      All caught up
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {priority.description}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold tabular-nums">
                  {priority.count}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {priority.count > 0 ? "Needs attention" : "Quiet"}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScheduleCard({
  todayEvents,
  tomorrowCount,
  contactById,
  saPath,
}: {
  todayEvents: CalendarEvent[];
  tomorrowCount: number;
  contactById: Map<string, Contact>;
  saPath: (path: string) => string;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Today&apos;s schedule</h2>
          <p className="text-xs text-muted-foreground">
            {todayEvents.length === 0
              ? "Nothing booked right now"
              : `${todayEvents.length} appointment${todayEvents.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1"
          render={<Link href={saPath("/calendar")} />}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {todayEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/10 p-5 text-center">
          <CalendarIcon className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm font-medium">No appointments today</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tomorrowCount > 0
              ? `${tomorrowCount} appointment${tomorrowCount !== 1 ? "s" : ""} tomorrow.`
              : "Add a showing or connect your calendar to start booking here."}
          </p>
          <Button
            size="sm"
            className="mt-4"
            render={<Link href={saPath("/calendar")} />}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add appointment
          </Button>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {todayEvents.map((event) => {
            const start = toDate(event.startAt);
            const time = start?.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            const contact = event.contactId
              ? contactById.get(event.contactId)
              : null;
            return (
              <li key={event.id} className="rounded-xl border bg-muted/20 p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/40">
                    <CalendarIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {time}
                        </span>
                      )}
                      {contact && (
                        <span className="truncate">{contact.name}</span>
                      )}
                      {event.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SetupProgressCard({
  progress,
  nextStep,
  saPath,
}: {
  progress: number;
  nextStep: (typeof ONBOARDING_STEPS)[number] | undefined;
  saPath: (path: string) => string;
}) {
  if (!nextStep) return null;

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Business setup
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              Your business is {progress}% ready
            </h2>
          </div>
          <div>
            <p className="text-sm font-medium">{nextStep.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {nextStep.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-muted/20 px-3 py-1 font-medium">
              About {nextStep.videoMinutes} min
            </span>
            <span className="rounded-full border bg-muted/20 px-3 py-1 font-medium">
              Progress saves as you go
            </span>
          </div>
        </div>

        <div className="w-full max-w-xs rounded-xl border bg-muted/10 p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Onboarding progress</span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-blue-600"
              style={{ width: `${progress}%` }}
            />
          </div>
          <Button className="mt-4 w-full" render={<Link href={saPath("/get-started")} />}>
            Continue setup
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function EmptyWorkspaceState({
  saPath,
}: {
  saPath: (path: string) => string;
}) {
  return (
    <section className="rounded-2xl border bg-card p-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-pink-500 text-white shadow-sm">
          <Users className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">
          No leads yet
        </h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Bring in your first contacts or activate a lead capture flow so the
          Today page can start surfacing real next actions for your business.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button render={<Link href={saPath("/contacts?import=1")} />}>
            <Users className="mr-1.5 h-4 w-4" />
            Import contacts
          </Button>
          <Button
            variant="outline"
            render={<Link href={saPath("/forms")} />}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            Activate Lead Capture
          </Button>
          <Button
            variant="ghost"
            render={<Link href={saPath("/calendar")} />}
          >
            <CalendarIcon className="mr-1.5 h-4 w-4" />
            Connect calendar
          </Button>
        </div>
      </div>
    </section>
  );
}

function formatElapsed(start: Date, end: Date): string {
  const diff = Math.max(0, end.getTime() - start.getTime());
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  return `${weeks}w`;
}
