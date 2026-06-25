"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { toDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskItem } from "@/components/tasks/task-item";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contacts";
import type { Task, TaskFilter } from "@/types/tasks";

export default function TasksPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskFilter>("today");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    if (!filterReady) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    let tasksReady = false;
    let contactsReady = false;
    const settle = () => {
      if (tasksReady && contactsReady) setLoading(false);
    };
    const unsubT = subscribeToTasks(scope, { territoryFilter }, (l) => {
      setTasks(l);
      tasksReady = true;
      settle();
    });
    const unsubC = subscribeToContacts(scope, { territoryFilter }, (l) => {
      setContacts(l);
      contactsReady = true;
      settle();
    });
    return () => {
      unsubT();
      unsubC();
    };
  }, [user, agencyId, subAccountId, authLoading, filterReady, territoryFilter]);

  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const buckets = useMemo(() => {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const overdue: Task[] = [];
    const todayList: Task[] = [];
    const upcoming: Task[] = [];
    const done: Task[] = [];

    for (const t of tasks) {
      if (t.completed) {
        done.push(t);
        continue;
      }
      const d = toDate(t.dueAt);
      if (!d) {
        upcoming.push(t);
        continue;
      }
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      if (d.getTime() < now && day.getTime() < today.getTime()) {
        overdue.push(t);
      } else if (day.getTime() === today.getTime()) {
        todayList.push(t);
      } else {
        upcoming.push(t);
      }
    }
    return { overdue, today: todayList, upcoming, done };
  }, [tasks]);

  const counts = {
    today: buckets.today.length + buckets.overdue.length,
    overdue: buckets.overdue.length,
    upcoming: buckets.upcoming.length,
    done: buckets.done.length,
    all: tasks.length,
  };

  const shown =
    filter === "today"
      ? [...buckets.overdue, ...buckets.today]
      : filter === "overdue"
        ? buckets.overdue
        : filter === "upcoming"
          ? buckets.upcoming
          : filter === "done"
            ? buckets.done.slice(0, 100)
            : tasks;

  function openNew() {
    setEditTask(null);
    setDialogOpen(true);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setDialogOpen(true);
  }

  const FILTERS: { id: TaskFilter; label: string; count: number }[] = [
    { id: "today", label: "Today", count: counts.today },
    { id: "overdue", label: "Overdue", count: counts.overdue },
    { id: "upcoming", label: "Upcoming", count: counts.upcoming },
    { id: "done", label: "Done", count: counts.done },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Follow-ups and reminders so nothing slips.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" />
          New Task
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border bg-muted/30 p-1">
        {FILTERS.map((f) => {
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  isActive ? "bg-muted" : "bg-background/80",
                )}
              >
                {f.count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState filter={filter} onAdd={openNew} />
      ) : (
        <div className="space-y-2">
          {shown.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              contact={t.contactId ? contactById.get(t.contactId) : undefined}
              onClick={openEdit}
            />
          ))}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contacts={contacts}
        task={editTask}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl border bg-muted/30"
        />
      ))}
    </div>
  );
}

function EmptyState({
  filter,
  onAdd,
}: {
  filter: TaskFilter;
  onAdd: () => void;
}) {
  const copy: Record<TaskFilter, { title: string; desc: string }> = {
    today: {
      title: "Nothing due today",
      desc: "You're caught up. Add a task to stay ahead.",
    },
    overdue: {
      title: "No overdue tasks",
      desc: "Clean slate — nothing's slipped.",
    },
    upcoming: {
      title: "No upcoming tasks",
      desc: "Plan a follow-up or reminder.",
    },
    done: {
      title: "Nothing completed yet",
      desc: "Completed tasks will land here.",
    },
    all: { title: "No tasks yet", desc: "Add your first follow-up." },
  };
  const { title, desc } = copy[filter];
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <CheckSquare className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-6 flex justify-center">
        <Button onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          New task
        </Button>
      </div>
    </div>
  );
}
