"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Workflow, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkflowStatusBadge } from "./workflow-status-badge";
import { TRIGGER_LABELS } from "@/lib/workflows/catalog";
import type { WorkflowStatus, WorkflowTriggerType } from "@/types/workflows";

interface Row {
  id: string;
  name: string;
  status: WorkflowStatus;
  trigger: { type: WorkflowTriggerType };
  stats?: { enrolled?: number; completed?: number };
}

export function WorkflowsList({ saId }: { saId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch(`/api/sub-accounts/${saId}/workflows`);
    const d = (await res.json().catch(() => ({}))) as { workflows?: Row[] };
    setRows(d.workflows ?? []);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saId]);

  async function create(template?: "speed-to-lead") {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: template ?? "blank" }),
      });
      const d = (await res.json()) as { id?: string };
      if (!res.ok || !d.id) throw new Error();
      router.push(`/sa/${saId}/workflows/${d.id}`);
    } catch {
      toast.error("Couldn't create workflow");
      setCreating(false);
    }
  }

  async function remove(id: string) {
    setRows((r) => r?.filter((x) => x.id !== id) ?? null);
    const res = await fetch(`/api/sub-accounts/${saId}/workflows/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Couldn't delete");
      void load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Automate follow-up across email, SMS, tasks and more.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => create("speed-to-lead")}
            disabled={creating}
          >
            <Zap className="mr-1 h-4 w-4" /> Speed-to-Lead
          </Button>
          <Button onClick={() => create()} disabled={creating}>
            {creating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            New workflow
          </Button>
        </div>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Workflow className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No workflows yet. Create your first automation.
          </p>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((w) => (
            <div key={w.id} className="flex items-center gap-3 p-4 hover:bg-muted/40">
              <Link href={`/sa/${saId}/workflows/${w.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{w.name}</span>
                  <WorkflowStatusBadge status={w.status} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {TRIGGER_LABELS[w.trigger?.type] ?? w.trigger?.type} ·{" "}
                  {w.stats?.enrolled ?? 0} enrolled
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => remove(w.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
