"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, User, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toDate } from "@/lib/format";
import { useSubAccount } from "@/context/sub-account-context";
import { Checkbox } from "@/components/ui/checkbox";
import type { Task } from "@/types/tasks";
import type { Contact } from "@/types/contacts";

export interface TaskItemProps {
  task: Task;
  contact?: Contact;
  onClick?: (task: Task) => void;
}

function formatDueLabel(d: Date): {
  label: string;
  tone: "overdue" | "today" | "soon" | "later";
} {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const due = new Date(d);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);

  if (due.getTime() < now.getTime()) {
    return {
      label: `Overdue · ${due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
      tone: "overdue",
    };
  }
  if (dueDay.getTime() === today.getTime()) {
    const timeStr = due
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: due.getMinutes() === 0 ? undefined : "2-digit",
      })
      .toLowerCase()
      .replace(" ", "");
    return { label: `Today · ${timeStr}`, tone: "today" };
  }
  if (dueDay.getTime() === tomorrow.getTime()) {
    return { label: "Tomorrow", tone: "soon" };
  }
  return {
    label: due.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    tone: "later",
  };
}

export function TaskItem({ task, contact, onClick }: TaskItemProps) {
  const { saPath } = useSubAccount();
  const [toggling, setToggling] = useState(false);

  async function toggleComplete() {
    if (toggling) return;
    setToggling(true);
    try {
      // Server route so task.completed fires + the activity is logged.
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !task.completed }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(b.error ?? "Couldn't update task.");
      }
    } finally {
      setToggling(false);
    }
  }

  const due = toDate(task.dueAt);
  const dueMeta = due ? formatDueLabel(due) : null;

  return (
    <div
      onClick={() => onClick?.(task)}
      className={cn(
        "group flex items-start gap-3 rounded-xl border bg-card p-3 transition-all",
        !task.completed && "cursor-pointer hover:border-primary/40 hover:shadow-sm",
        task.completed && "opacity-60",
      )}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="pt-0.5"
      >
        <Checkbox
          checked={task.completed}
          onCheckedChange={toggleComplete}
          disabled={toggling}
          aria-label="Mark task complete"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            task.completed && "line-through",
          )}
        >
          {task.title}
        </p>
        {task.notes && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {task.notes}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
          {dueMeta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
                dueMeta.tone === "overdue" &&
                  "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                dueMeta.tone === "today" &&
                  "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                dueMeta.tone === "soon" &&
                  "bg-blue-500/10 text-blue-700 dark:text-blue-300",
                dueMeta.tone === "later" &&
                  "bg-muted text-muted-foreground",
              )}
            >
              {dueMeta.tone === "overdue" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {dueMeta.label}
            </span>
          )}
          {contact && (
            <Link
              href={saPath(`/contacts/${contact.id}`)}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline"
            >
              <User className="h-3 w-3" />
              {contact.name || contact.email}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
