"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToTasksForContact } from "@/lib/firestore/tasks";
import { Button } from "@/components/ui/button";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskItem } from "@/components/tasks/task-item";
import type { Contact } from "@/types/contacts";
import type { Task } from "@/types/tasks";

export function ContactTasks({ contact }: { contact: Contact }) {
  const { user } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!user || !agencyId) return;
    setLoading(true);
    const unsub = subscribeToTasksForContact(
      contact.id,
      { agencyId, subAccountId },
      (list) => {
        setTasks(list);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [contact.id, user, agencyId, subAccountId]);

  const openCount = tasks.filter((t) => !t.completed).length;

  function openNew() {
    setEditTask(null);
    setDialogOpen(true);
  }
  function openEdit(task: Task) {
    setEditTask(task);
    setDialogOpen(true);
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tasks
          </p>
          <p className="mt-0.5 text-sm font-semibold">
            {loading
              ? "…"
              : openCount === 0
                ? "No open tasks"
                : `${openCount} open`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add task
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg border bg-muted/40"
            />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
          <CheckSquare className="mx-auto mb-1 h-4 w-4" />
          No tasks yet — add a follow-up to stay in motion.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.slice(0, 5).map((t) => (
            <TaskItem key={t.id} task={t} contact={contact} onClick={openEdit} />
          ))}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contacts={[contact]}
        task={editTask}
        defaultContactId={contact.id}
      />
    </div>
  );
}
