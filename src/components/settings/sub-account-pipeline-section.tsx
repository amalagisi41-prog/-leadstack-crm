"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, GitBranch, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PipelineStageId } from "@/types/deals";

/**
 * Pipeline section — rename + reorder the deal pipeline stages. Admin-only.
 *
 * Pure display layer: only labels + order are editable. Stage ids and the
 * won/lost terminals are fixed, so this never changes a deal's stage, the
 * public API, webhooks, or reports math. "Reset to defaults" clears the
 * override and restores the canonical stages.
 */

interface Row {
  id: PipelineStageId;
  label: string;
  tone: string;
  terminal?: "won" | "lost";
}

export function SubAccountPipelineSection() {
  const { subAccountId, isAdmin } = useSubAccount();
  const resolved = usePipelineStages();

  // Seed local edit state from the resolved stages; re-seed whenever the
  // saved config changes (resolved identity is stable until that happens).
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    setRows(
      resolved.map((s) => ({
        id: s.id,
        label: s.label,
        tone: s.tone,
        terminal: s.terminal,
      })),
    );
  }, [resolved]);

  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const dirty = useMemo(() => {
    if (rows.length !== resolved.length) return false;
    return rows.some(
      (r, i) => r.id !== resolved[i].id || r.label !== resolved[i].label,
    );
  }, [rows, resolved]);

  if (!isAdmin) return null;

  function move(index: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function setLabel(index: number, label: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, label } : r)),
    );
  }

  async function save() {
    if (rows.some((r) => !r.label.trim())) {
      toast.error("Every stage needs a label.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/pipeline-stages`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stages: rows.map((r, i) => ({
              id: r.id,
              label: r.label.trim(),
              order: i,
            })),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't save the pipeline.");
        return;
      }
      toast.success("Pipeline updated.");
    } catch {
      toast.error("Couldn't save the pipeline. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (
      !confirm("Reset the pipeline to the default stage names and order?")
    ) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/pipeline-stages`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset: true }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't reset the pipeline.");
        return;
      }
      toast.success("Pipeline reset to defaults.");
    } catch {
      toast.error("Couldn't reset the pipeline. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <GitBranch className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Pipeline stages</h2>
          <p className="text-xs text-muted-foreground">
            Rename your deal stages and reorder them to match how your team
            works. The Won and Lost stages stay as the closed states (they
            drive reports + automations) — you can rename and reposition them,
            but they can&apos;t be removed.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className="flex items-center gap-2 rounded-lg border bg-background p-2"
          >
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Move up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Move down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                r.tone.split(" ")[0],
              )}
              aria-hidden
            />
            <Input
              value={r.label}
              onChange={(e) => setLabel(i, e.target.value)}
              maxLength={40}
              className="h-8 flex-1"
            />
            {r.terminal && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                  r.terminal === "won"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                )}
                title="Closed state — drives reports + automations"
              >
                {r.terminal}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2">
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={save}>
          {saving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : null}
          Save pipeline
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={resetting || saving}
          onClick={reset}
        >
          {resetting ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : null}
          Reset to defaults
        </Button>
      </div>
    </section>
  );
}
