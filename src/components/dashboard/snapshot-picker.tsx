"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";

/**
 * Role-snapshot picker shown on the onboarding checklist. Applying a snapshot
 * re-configures the pipeline, templates, AI persona, and draft workflows for
 * the chosen role so a CSV import lands in a ready-to-work setup.
 */
const ROLES: { id: string; label: string; blurb: string }[] = [
  { id: "solo_agent", label: "Solo Agent", blurb: "Simple pipeline + Speed-to-Lead" },
  { id: "team_builder", label: "Team Builder", blurb: "Lead routing + nurture drip" },
  { id: "broker_office", label: "Broker Office", blurb: "Lead distribution + oversight" },
];

export function SnapshotPicker() {
  const { subAccountId } = useSubAccount();
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  async function apply(id: string) {
    setApplying(id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/apply-snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not apply.");
      setApplied(id);
      toast.success(data.message ?? "Setup applied.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply.");
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-foreground">
        Set up for your business type
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {ROLES.map((r) => {
          const busy = applying === r.id;
          const done = applied === r.id;
          return (
            <button
              key={r.id}
              onClick={() => apply(r.id)}
              disabled={!!applying}
              className={`rounded-lg border p-2.5 text-left text-xs transition-colors hover:border-blue-300 disabled:opacity-60 ${
                done ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20" : "bg-card"
              }`}
            >
              <span className="flex items-center gap-1 font-semibold">
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                {done && <Check className="h-3 w-3 text-emerald-500" />}
                {r.label}
              </span>
              <span className="mt-0.5 block text-muted-foreground">{r.blurb}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Applies a tailored pipeline, templates, AI persona, and draft workflows —
        then just import your contacts by CSV to get started.
      </p>
    </div>
  );
}
