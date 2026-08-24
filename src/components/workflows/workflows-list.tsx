"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { openAskAssistant } from "@/components/dashboard/ask-assistant-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkflowStatusBadge } from "./workflow-status-badge";
import { TRIGGER_LABELS } from "@/lib/workflows/catalog";
import { WORKFLOW_STARTER_TEMPLATES } from "@/lib/workflows/starter-templates";
import type { WorkflowStatus, WorkflowTriggerType } from "@/types/workflows";

interface Row {
  id: string;
  name: string;
  status: WorkflowStatus;
  trigger: { type: WorkflowTriggerType };
  stats?: { enrolled?: number; completed?: number };
  /** Set when the SYSTEM paused this workflow. See WorkflowDoc.pausedReason. */
  pausedReason?: string | null;
}

export function WorkflowsList({ saId }: { saId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [resuming, setResuming] = useState<string | null>(null);
  /**
   * Whether this deployment can run a workflow at all, answered live by the
   * server rather than inferred from a workflow's own status.
   *
   * Starts `true` so the first paint of a healthy workspace never flashes a
   * scary banner before the answer arrives.
   */
  const [canSend, setCanSend] = useState(true);

  async function load() {
    const res = await fetch(`/api/sub-accounts/${saId}/workflows`);
    const d = (await res.json().catch(() => ({}))) as {
      workflows?: Row[];
      automaticSendingConfigured?: boolean;
    };
    setRows(d.workflows ?? []);
    setCanSend(d.automaticSendingConfigured !== false);
  }

  /**
   * Turn a paused workflow on from the list.
   *
   * A paused row that only explains itself is still a dead end — the fix has to
   * be reachable from the place the problem is named.
   */
  async function resume(id: string) {
    setResuming(id);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/workflows/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error();
      await load();
      toast.success("Workflow turned on");
    } catch {
      toast.error("Couldn't turn this workflow on");
    } finally {
      setResuming(null);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saId]);

  async function create(template?: string) {
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
          <h1 className="text-xl font-semibold">Follow-Up Plans</h1>
          <p className="text-sm text-muted-foreground">
            Automate follow-up across email, SMS, tasks and more.
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" disabled={creating} />}
            >
              <Zap className="mr-1 h-4 w-4" /> Start from a template
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {WORKFLOW_STARTER_TEMPLATES.map((t) => (
                <DropdownMenuItem
                  key={t.key}
                  onClick={() => create(t.key)}
                  className="flex-col items-start gap-0.5 py-2"
                >
                  <span className="font-medium">{t.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
          {rows.map((w) => {
            // An Active workflow on a deployment that cannot schedule anything
            // does not sit idle — it enrols the lead, counts them, and sends
            // nothing. That is the failure this row has to name out loud.
            const activeButSilent = w.status === "active" && !canSend;
            return (
              <div key={w.id} className="p-4 hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/sa/${saId}/workflows/${w.id}`}
                    className="min-w-0 flex-1"
                  >
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

                {activeButSilent ? (
                  <div className="mt-3 flex flex-wrap items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-5 text-amber-900">
                        <span className="font-medium">
                          On, but nothing is being sent.
                        </span>{" "}
                        Automatic sending isn&apos;t set up on this deployment,
                        so leads are enrolled in this plan and then never
                        contacted.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() =>
                          openAskAssistant({
                            prompt:
                              "My follow-up plans say they're on, but nothing " +
                              "is sending. Walk me through setting up automatic " +
                              "sending (QStash) for this deployment, step by step.",
                          })
                        }
                      >
                        How do I fix this?
                      </Button>
                    </div>
                  </div>
                ) : null}

                {w.status === "paused" && w.pausedReason ? (
                  <div className="mt-3 rounded-lg border bg-muted/50 p-3">
                    <p className="text-muted-foreground text-xs leading-5">
                      {w.pausedReason}
                    </p>
                    {canSend ? (
                      // The blocker that caused the pause is gone. Say so, and
                      // put the one remaining action right here.
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-emerald-700">
                          Automatic sending is set up now.
                        </span>
                        <Button
                          size="sm"
                          onClick={() => void resume(w.id)}
                          disabled={resuming === w.id}
                        >
                          {resuming === w.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Turn it on
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() =>
                          openAskAssistant({
                            prompt:
                              "My follow-up plans are paused because automatic " +
                              "sending isn't configured. Walk me through setting " +
                              "up QStash for this deployment, step by step.",
                          })
                        }
                      >
                        Set up automatic sending
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
