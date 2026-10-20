"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";

type RangeKey = "7d" | "30d" | "90d" | "all";

/**
 * "Summarize performance" — the operator-facing entry point for the
 * reports.performance-narrative skill (lib/marketing/performance-narrative.ts).
 * Lives on the Reports page, one range below the KPI tiles it narrates.
 */
export function PerformanceNarrativeCard({ range }: { range: RangeKey }) {
  const { subAccountId } = useSubAccount();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    narrative: string;
    recommendations: string[];
  } | null>(null);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/performance-narrative`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ range }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        narrative?: string;
        recommendations?: string[];
        error?: string;
      };
      if (!res.ok || !data.narrative) {
        throw new Error(data.error ?? "Could not generate a summary.");
      }
      setResult({
        narrative: data.narrative,
        recommendations: data.recommendations ?? [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a summary.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            Summarize performance
          </h2>
          <p className="text-xs text-muted-foreground">
            A plain-English read of the KPIs above, grounded in your own numbers.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Thinking…
            </>
          ) : result ? (
            "Regenerate"
          ) : (
            "Summarize"
          )}
        </Button>
      </div>

      {result ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed">{result.narrative}</p>
          {result.recommendations.length > 0 ? (
            <ul className="space-y-1.5">
              {result.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="text-violet-600 dark:text-violet-400">•</span>
                  {r}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
