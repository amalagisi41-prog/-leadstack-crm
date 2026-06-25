"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NODE_LABELS } from "@/lib/workflows/catalog";
import type { WorkflowNodeType, WorkflowRunStatus } from "@/types/workflows";

interface RunRow {
  id: string;
  contactName: string;
  status: WorkflowRunStatus;
  test: boolean;
  enrolledAtMs: number;
  history: { type: string; result: string; atMs: number }[];
}

const STATUS_TONE: Record<WorkflowRunStatus, string> = {
  running: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  waiting: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  exited: "bg-muted text-muted-foreground",
};

function when(ms: number): string {
  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function WorkflowRuns({
  saId,
  workflowId,
}: {
  saId: string;
  workflowId: string;
}) {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/sub-accounts/${saId}/workflows/${workflowId}/runs`,
    );
    const d = (await res.json().catch(() => ({}))) as { runs?: RunRow[] };
    setRuns(d.runs ?? []);
  }, [saId, workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/sa/${saId}/workflows/${workflowId}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to builder
        </Link>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <h1 className="text-xl font-semibold">Runs</h1>

      {runs === null ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No runs yet. Trigger this workflow or use Test to enroll a contact.
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {runs.map((r) => {
            const isOpen = open.has(r.id);
            return (
              <div key={r.id}>
                <button
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
                  onClick={() =>
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    })
                  }
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {r.contactName}
                    {r.test && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        test
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {when(r.enrolledAtMs)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      STATUS_TONE[r.status],
                    )}
                  >
                    {r.status}
                  </span>
                </button>
                {isOpen && (
                  <ol className="space-y-1 border-t bg-muted/20 px-4 py-3 text-xs">
                    {r.history.length === 0 && (
                      <li className="text-muted-foreground">No steps run yet.</li>
                    )}
                    {r.history.map((h, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span>
                          {NODE_LABELS[h.type as WorkflowNodeType] ?? h.type}
                          <span className="ml-2 text-muted-foreground">
                            {h.result}
                          </span>
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {when(h.atMs)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
