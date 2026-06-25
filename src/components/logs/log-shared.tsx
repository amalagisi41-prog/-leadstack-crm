"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ModeFilter = "all" | "live" | "test";

/** Absolute local timestamp, matching the webhook settings rows. */
export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return d.toLocaleString();
}

/** Tailwind text colour for an HTTP status code. 0 = never attempted. */
export function httpStatusClass(status: number | null): string {
  if (!status) return "text-muted-foreground";
  if (status >= 200 && status < 300) return "text-emerald-600 dark:text-emerald-400";
  if (status >= 300 && status < 400) return "text-sky-600 dark:text-sky-400";
  if (status >= 400 && status < 500) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export function ModeBadge({ mode }: { mode: "live" | "test" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        mode === "live"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      {mode}
    </span>
  );
}

/**
 * Shared toolbar: a live/test/all segmented filter on the left, a result
 * count + refresh button on the right.
 */
export function LogToolbar({
  mode,
  onModeChange,
  count,
  loading,
  onRefresh,
}: {
  mode: ModeFilter;
  onModeChange: (m: ModeFilter) => void;
  count: number;
  loading: boolean;
  onRefresh: () => void;
}) {
  const modes: ModeFilter[] = ["all", "live", "test"];
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 text-xs">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium capitalize transition-colors",
              mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>
    </div>
  );
}

/** Monospace block for headers / body excerpts in the expanded detail. */
export function CodeBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  let pretty = value;
  try {
    pretty = JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    // Not JSON — show raw.
  }
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-foreground">
        {pretty}
      </pre>
    </div>
  );
}
