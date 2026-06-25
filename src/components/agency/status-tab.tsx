"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HealthStatus, IntegrationHealth, SubCheck } from "@/lib/health/checks";

export function StatusTab() {
  const [results, setResults] = useState<IntegrationHealth[] | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchHealth = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/agency/health${refresh ? "?refresh=1" : ""}`,
      );
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "Agency owner only."
            : `Health check failed: ${res.status}`,
        );
      }
      const body = (await res.json()) as {
        results: IntegrationHealth[];
        cachedAt: number;
      };
      setResults(body.results);
      setCachedAt(body.cachedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Group by category for visual grouping.
  const grouped = (results ?? []).reduce<
    Record<string, IntegrationHealth[]>
  >((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  const counts = (results ?? []).reduce(
    (acc, r) => {
      if (r.status === "ok") acc.ok++;
      else if (r.status === "partial") acc.partial++;
      else if (r.status === "missing") {
        if (r.required) acc.criticalMissing++;
        else acc.optionalMissing++;
      } else if (r.status === "error") acc.error++;
      else acc.skipped++;
      return acc;
    },
    { ok: 0, partial: 0, criticalMissing: 0, optionalMissing: 0, error: 0, skipped: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">Integration health</h2>
          <p className="text-xs text-muted-foreground">
            {cachedAt ? (
              <>Last checked {formatRelative(cachedAt)}.</>
            ) : loading ? (
              <>Running checks…</>
            ) : (
              <>—</>
            )}
            {results && (
              <>
                {" · "}
                <span className="text-emerald-600 dark:text-emerald-400">
                  {counts.ok} ok
                </span>
                {counts.partial > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-600 dark:text-amber-400">
                      {counts.partial} partial
                    </span>
                  </>
                )}
                {(counts.criticalMissing > 0 || counts.error > 0) && (
                  <>
                    {" · "}
                    <span className="text-rose-600 dark:text-rose-400">
                      {counts.criticalMissing + counts.error} need attention
                    </span>
                  </>
                )}
                {counts.optionalMissing > 0 && (
                  <>
                    {" · "}
                    <span className="text-muted-foreground">
                      {counts.optionalMissing} optional unset
                    </span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fetchHealth(true)}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          )}
          Refresh
        </Button>

        {/* Colour key — the dot semantics are correct but not self-evident, so
            spell them out (esp. that gray = optional/off, not broken). */}
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-[11px] text-muted-foreground">
          <LegendItem
            colorClass="bg-emerald-500"
            label="Healthy"
            title="Configured and reachable."
          />
          <LegendItem
            colorClass="bg-amber-500"
            label="Needs attention"
            title="Partially set up or degraded — e.g. a credential present but a sender domain / webhook not finished."
          />
          <LegendItem
            colorClass="bg-rose-500"
            label="Action required"
            title="A required integration is missing, or a configured one failed its live check."
          />
          <LegendItem
            colorClass="bg-muted-foreground/40"
            label="Optional / off"
            title="An optional integration that isn't configured. Not an error — this feature is simply turned off."
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-600 dark:text-rose-400" />
          <p>{error}</p>
        </div>
      )}

      {!results && !error && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border bg-muted/30"
            />
          ))}
        </div>
      )}

      {results && (
        <div className="space-y-5">
          {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((category) => (
            <section key={category}>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABELS[category]}
              </h3>
              <ul className="space-y-2">
                {grouped[category].map((r) => (
                  <HealthCard
                    key={r.id}
                    health={r}
                    expanded={expanded.has(r.id)}
                    onToggle={() => toggle(r.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORY_ORDER: IntegrationHealth["category"][] = [
  "core",
  "comms",
  "ai-agents",
  "automations",
  "website",
  "leads",
  "billing",
];

const CATEGORY_LABELS: Record<IntegrationHealth["category"], string> = {
  core: "Core (required to boot)",
  comms: "Communications",
  "ai-agents": "AI Agents",
  automations: "Automations",
  website: "Website builder",
  leads: "Leads map",
  billing: "Billing",
};

function HealthCard({
  health,
  expanded,
  onToggle,
}: {
  health: IntegrationHealth;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tone = effectiveTone(health.status, health.required);

  return (
    <li className={`overflow-hidden rounded-xl border ${tone.border}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/30 ${tone.bg}`}
        aria-expanded={expanded}
      >
        <StatusLight status={health.status} required={health.required} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{health.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {health.message}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="space-y-1 border-t bg-background p-3 text-xs">
          {health.subChecks.map((s, i) => (
            <SubCheckRow key={i} check={s} />
          ))}
        </div>
      )}
    </li>
  );
}

function SubCheckRow({ check }: { check: SubCheck }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="mt-0.5">
        <StatusDot status={check.status} required={false} small />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px]">{check.label}</p>
        {check.detail && (
          <p className="text-[11px] text-muted-foreground">{check.detail}</p>
        )}
      </div>
    </div>
  );
}

/** One swatch + label in the colour key under the panel header. */
function LegendItem({
  colorClass,
  label,
  title,
}: {
  colorClass: string;
  label: string;
  title: string;
}) {
  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${colorClass}`} />
      {label}
    </span>
  );
}

/**
 * Single status dot — one of four colours matching the legend: green
 * (healthy), amber (needs attention), red (action required: error or a
 * required integration missing), gray (optional / off).
 */
function StatusLight({
  status,
  required,
}: {
  status: HealthStatus;
  required: boolean;
}) {
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(status, required)}`}
      aria-label={`Status: ${status}`}
    />
  );
}

/** Background colour class for the single status dot — matches the legend. */
function statusDotClass(status: HealthStatus, required: boolean): string {
  if (status === "ok") return "bg-emerald-500";
  if (status === "partial") return "bg-amber-500";
  if (status === "error") return "bg-rose-500";
  if (status === "missing") {
    return required ? "bg-rose-500" : "bg-muted-foreground/40";
  }
  return "bg-muted-foreground/40"; // skipped → gray
}

function StatusDot({
  status,
  required,
  small,
}: {
  status: HealthStatus;
  required: boolean;
  small?: boolean;
}) {
  const tone = effectiveTone(status, required);
  const Icon =
    status === "ok"
      ? CircleCheck
      : status === "error"
        ? CircleAlert
        : status === "partial"
          ? CircleAlert
          : CircleDashed;
  const sz = small ? "h-3 w-3" : "h-4 w-4";
  return <Icon className={`${sz} ${tone.text}`} />;
}

interface ToneClasses {
  text: string;
  bg: string;
  border: string;
}

/**
 * Pick the visual tone given a status and whether the integration is
 * required-to-boot. Optional integrations that are unset render gray
 * (not red) so the dashboard isn't a sea of red on a fresh clone.
 */
function effectiveTone(status: HealthStatus, required: boolean): ToneClasses {
  if (status === "ok") {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "",
      border: "border-emerald-500/20",
    };
  }
  if (status === "partial") {
    return {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/5",
      border: "border-amber-500/30",
    };
  }
  if (status === "error") {
    return {
      text: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/5",
      border: "border-rose-500/30",
    };
  }
  if (status === "missing") {
    if (required) {
      return {
        text: "text-rose-600 dark:text-rose-400",
        bg: "bg-rose-500/5",
        border: "border-rose-500/30",
      };
    }
    return {
      text: "text-muted-foreground",
      bg: "",
      border: "",
    };
  }
  return {
    text: "text-muted-foreground",
    bg: "",
    border: "",
  };
}

function formatRelative(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}
