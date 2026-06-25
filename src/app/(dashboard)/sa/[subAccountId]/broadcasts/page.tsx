"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Mail, Send, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, toDate } from "@/lib/format";
import { PIPELINE_STAGES } from "@/types/deals";
import type { BroadcastAudienceFilter, BroadcastDoc } from "@/types";

/**
 * Broadcasts list — every bulk-email batch fired from this sub-account,
 * newest first. Each row shows audience size, sent / skipped / failed
 * totals, and links into the per-recipient detail page.
 *
 * v1 is email-only. v2 adds SMS broadcasts and a channel filter chip.
 */
export default function BroadcastsListPage() {
  const { user, loading: authLoading } = useAuth();
  const { agencyId, subAccountId, saPath } = useSubAccount();
  const [broadcasts, setBroadcasts] = useState<BroadcastDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const q = query(
      collection(getFirebaseDb(), "broadcasts"),
      where("subAccountId", "==", subAccountId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as BroadcastDoc);
        list.sort(
          (a, b) =>
            (toDate(b.createdAt)?.getTime() ?? 0) -
            (toDate(a.createdAt)?.getTime() ?? 0),
        );
        setBroadcasts(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Broadcasts</h1>
          <p className="text-sm text-muted-foreground">
            Bulk email sends. Open any one for per-recipient delivery status.
          </p>
        </div>
        <Button render={<Link href={saPath("/contacts")} />} variant="outline">
          <Mail className="mr-1 h-4 w-4" />
          Send a new broadcast
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border bg-muted/30"
            />
          ))}
        </div>
      ) : broadcasts.length === 0 ? (
        <EmptyState contactsHref={saPath("/contacts")} />
      ) : (
        <ul className="space-y-2">
          {broadcasts.map((b) => (
            <li key={b.id}>
              <Link
                href={saPath(`/broadcasts/${b.id}`)}
                className="block rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:bg-accent/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Mail className="h-3.5 w-3.5" />
                      </span>
                      <p className="truncate font-medium">
                        {b.templateName}
                      </p>
                      <StatusBadge status={b.status} />
                    </div>
                    {b.subjectPreview && (
                      <p className="ml-9 mt-0.5 truncate text-xs text-muted-foreground">
                        {b.subjectPreview}
                      </p>
                    )}
                    <p className="ml-9 mt-1 text-xs text-muted-foreground">
                      {audienceLabel(b.audienceFilter)} ·{" "}
                      {formatRelativeTime(b.createdAt)} · by{" "}
                      {b.createdBy?.displayName || b.createdBy?.email || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <Stat label="Sent" value={b.totals.sent} tone="emerald" />
                    <Stat
                      label="Skipped"
                      value={b.totals.skipped}
                      tone="muted"
                    />
                    <Stat
                      label="Failed"
                      value={b.totals.failed}
                      tone={b.totals.failed > 0 ? "rose" : "muted"}
                    />
                    <Stat label="Total" value={b.totals.audienceSize} tone="muted" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function audienceLabel(filter: BroadcastAudienceFilter): string {
  if (filter.kind === "all") return "All contacts";
  if (filter.kind === "tag") return `Tag: ${filter.tag}`;
  const stage = PIPELINE_STAGES.find((s) => s.id === filter.stage);
  return `Stage: ${stage?.label ?? filter.stage}`;
}

function StatusBadge({ status }: { status: BroadcastDoc["status"] }) {
  const map: Record<BroadcastDoc["status"], string> = {
    queued:
      "bg-slate-500/15 text-slate-700 ring-1 ring-slate-500/30 dark:text-slate-300",
    sending:
      "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30 dark:text-blue-300",
    completed:
      "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300",
    failed:
      "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status]}`}
    >
      {status}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "muted";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className={`font-mono text-sm font-semibold ${valueClass}`}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function EmptyState({ contactsHref }: { contactsHref: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Send className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">No broadcasts yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Send a bulk email to all contacts, or to anyone with a specific tag /
        pipeline stage. Opted-out contacts are skipped automatically.
      </p>
      <div className="mt-6 flex justify-center">
        <Button render={<Link href={contactsHref} />}>
          <Users className="mr-1 h-4 w-4" />
          Go to contacts
        </Button>
      </div>
    </div>
  );
}
