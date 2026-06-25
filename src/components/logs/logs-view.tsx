"use client";

import { useState } from "react";
import { Cable, Lock, ScrollText, Webhook } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";
import { ApiLogsTab } from "./api-logs-tab";
import { WebhookLogsTab } from "./webhook-logs-tab";

type Tab = "api" | "webhooks";

const TABS: Array<{ key: Tab; label: string; icon: typeof Cable }> = [
  { key: "api", label: "API requests", icon: Cable },
  { key: "webhooks", label: "Webhooks", icon: Webhook },
];

/**
 * Logs landing. Renders a segmented tab control over the two log surfaces.
 * Each tab owns its own fetch + filter state so switching is cheap and the
 * inactive tab doesn't keep polling. Admin-only — collaborators see a lock.
 */
export function LogsView() {
  const { isAdmin } = useSubAccount();
  const [tab, setTab] = useState<Tab>("api");

  if (!isAdmin) {
    return (
      <div className="space-y-6 p-6">
        <Heading />
        <div className="flex items-start gap-3 rounded-2xl border border-dashed bg-muted/30 p-6 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-muted-foreground">
            <p className="font-medium text-foreground">
              Logs are limited to sub-account admins.
            </p>
            <p className="mt-1">
              Request and webhook logs can include payload excerpts, so they
              follow the same access bar as API keys and webhooks. Ask your
              agency administrator for admin access on this sub-account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <Heading />

      <div className="inline-flex rounded-lg border bg-muted/30 p-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "api" ? <ApiLogsTab /> : <WebhookLogsTab />}
    </div>
  );
}

function Heading() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
        <ScrollText className="h-5 w-5" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inspect recent public-API requests and outbound webhook deliveries
          for this sub-account. Read-only — useful for debugging integrations
          and failed deliveries.
        </p>
      </div>
    </div>
  );
}
