"use client";

import { useState } from "react";
import { Database, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * LeadStack-demo-only panel. Renders inside Agency -> Settings ONLY when
 * LANDING_VARIANT === "leadstack" (the parent page gates the mount).
 * Buyer clones never see this UI, AND the API route returns 404 for them
 * too, so the surface is double-gated.
 *
 * Targets sub-account #1004 by accountNumber on the server.
 */
export function SeedDemoSection() {
  const [seeding, setSeeding] = useState(false);
  const [unseeding, setUnseeding] = useState(false);
  const busy = seeding || unseeding;

  async function handleSeed() {
    if (busy) return;
    if (
      !confirm(
        "Seed sub-account #1004 with 300 contacts (200 around London, 100 worldwide), ~80 deals across pipeline stages, and matching activities? Existing data on #1004 is left alone — this only ADDS records tagged 'seed'.",
      )
    ) {
      return;
    }
    setSeeding(true);
    try {
      const res = await fetch("/api/dev-only/seed-demo", { method: "POST" });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        contactsCreated?: number;
        dealsCreated?: number;
        activitiesCreated?: number;
      };
      if (!res.ok) throw new Error(payload.error ?? "Seed failed.");
      toast.success(
        `Seeded ${payload.contactsCreated} contacts, ${payload.dealsCreated} deals, ${payload.activitiesCreated} activities.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seed failed.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleUnseed() {
    if (busy) return;
    if (
      !confirm(
        "Remove EVERY contact in sub-account #1004 tagged 'seed' (plus their deals, notes, and activities). Untagged contacts created by hand or via real form submits are left alone. This cannot be undone.",
      )
    ) {
      return;
    }
    setUnseeding(true);
    try {
      const res = await fetch("/api/dev-only/seed-demo", { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        contactsRemoved?: number;
        dealsRemoved?: number;
      };
      if (!res.ok) throw new Error(payload.error ?? "Unseed failed.");
      toast.success(
        `Removed ${payload.contactsRemoved} contacts and ${payload.dealsRemoved} deals.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unseed failed.");
    } finally {
      setUnseeding(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Database className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Demo seed (LeadStack-only)</h2>
          <p className="text-xs text-muted-foreground">
            Populate sub-account #1004 with realistic demo data, or clean it up
            afterwards. This panel only appears on the LeadStack-branded
            deployment; buyer clones never see it.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Seed #1004</p>
            <p className="text-xs text-muted-foreground">
              300 contacts (200 London, 100 worldwide), ~80 deals across all
              pipeline stages, plus activities and notes. Tagged{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                seed
              </code>{" "}
              for cleanup.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSeed}
            disabled={busy}
            className="shrink-0"
          >
            {seeding ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Seeding…
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Seed
              </>
            )}
          </Button>
        </div>

        <div className="border-t pt-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Remove seed data</p>
              <p className="text-xs text-muted-foreground">
                Deletes every contact tagged{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                  seed
                </code>{" "}
                in #1004, along with their deals, notes, and activities.
                Real (untagged) contacts are untouched.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUnseed}
              disabled={busy}
              className="shrink-0"
            >
              {unseeding ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Removing…
                </>
              ) : (
                <>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
