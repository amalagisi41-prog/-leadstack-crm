"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sunrise } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";

/**
 * Self-serve toggle for the Daily Briefing — a once-a-day email summarizing
 * new leads, tasks due/overdue, today's appointments, deals won, and
 * escalated AI conversations. Sent ~7am in the sub-account's timezone to
 * active admin members. See lib/briefing/.
 */
export function SubAccountDailyBriefingSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(subAccount?.dailyBriefingEnabled === true);
  }, [subAccount?.dailyBriefingEnabled]);

  if (!isAdmin) return null;

  async function handleToggle(next: boolean) {
    setSaving(true);
    const prev = enabled;
    setEnabled(next);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/daily-briefing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't save.");
      }
      toast.success(next ? "Daily briefing turned on." : "Daily briefing turned off.");
    } catch (err) {
      setEnabled(prev);
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-1 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background">
          <Sunrise className="h-4 w-4 text-amber-500" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Daily briefing</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A once-a-day email — new leads, tasks due, today&rsquo;s
            appointments, deals won, and any chats waiting on you. Sent each
            morning to active admins. Requires email (Resend) configured on
            this deployment.
          </p>
        </div>
      </header>

      <label className="mt-4 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={() => handleToggle(!enabled)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
            enabled ? "bg-emerald-500" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
        <span className="flex items-center gap-2 text-sm font-medium">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {enabled ? "On" : "Off"}
        </span>
      </label>
    </section>
  );
}
