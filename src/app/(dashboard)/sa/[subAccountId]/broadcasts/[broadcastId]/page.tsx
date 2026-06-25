"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  onSnapshot,
  query,
} from "firebase/firestore";
import { ArrowLeft, Mail } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { formatContactDate, formatRelativeTime } from "@/lib/format";
import { PIPELINE_STAGES } from "@/types/deals";
import type {
  BroadcastAudienceFilter,
  BroadcastDoc,
  BroadcastSendDoc,
} from "@/types";

/**
 * Broadcast detail page — header with totals, then a per-recipient table
 * showing each contact's delivery status. Live via onSnapshot so the rows
 * update as the QStash fan-out drains.
 */
export default function BroadcastDetailPage() {
  const params = useParams<{ broadcastId: string }>();
  const id = params.broadcastId;
  const { saPath } = useSubAccount();
  const [broadcast, setBroadcast] = useState<BroadcastDoc | null>(null);
  const [sends, setSends] = useState<BroadcastSendDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsubBroadcast = onSnapshot(
      doc(getFirebaseDb(), "broadcasts", id),
      (snap) => {
        setBroadcast(snap.exists() ? (snap.data() as BroadcastDoc) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubSends = onSnapshot(
      query(collection(getFirebaseDb(), "broadcasts", id, "sends")),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as BroadcastSendDoc);
        list.sort((a, b) => {
          // Failed → top, then queued, then sent, then skipped — failures
          // are what the operator most needs to see.
          const order: Record<BroadcastSendDoc["status"], number> = {
            failed: 0,
            queued: 1,
            sent: 2,
            skipped: 3,
          };
          const o = order[a.status] - order[b.status];
          if (o !== 0) return o;
          return a.toName.localeCompare(b.toName);
        });
        setSends(list);
      },
    );
    return () => {
      unsubBroadcast();
      unsubSends();
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-40 animate-pulse rounded bg-muted/40" />
        <div className="h-24 animate-pulse rounded-xl border bg-muted/30" />
        <div className="h-64 animate-pulse rounded-xl border bg-muted/30" />
      </div>
    );
  }
  if (!broadcast) {
    return (
      <div className="space-y-4">
        <Link
          href={saPath("/broadcasts")}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to broadcasts
        </Link>
        <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
          <h3 className="text-base font-semibold">Broadcast not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been deleted, or you don&apos;t have access.
          </p>
        </div>
      </div>
    );
  }

  const t = broadcast.totals;
  const progress =
    t.audienceSize > 0
      ? Math.round(((t.sent + t.skipped + t.failed) / t.audienceSize) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={saPath("/broadcasts")}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to broadcasts
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Mail className="h-4 w-4" />
              </span>
              {broadcast.templateName}
            </h1>
            {broadcast.subjectPreview && (
              <p className="mt-1 text-sm text-muted-foreground">
                {broadcast.subjectPreview}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {audienceLabel(broadcast.audienceFilter)} · sent{" "}
              {formatRelativeTime(broadcast.createdAt)} by{" "}
              {broadcast.createdBy?.displayName ||
                broadcast.createdBy?.email ||
                "—"}
            </p>
          </div>
          <StatusBadge status={broadcast.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Sent" value={t.sent} tone="emerald" />
        <SummaryCard label="Skipped" value={t.skipped} tone="muted" />
        <SummaryCard label="Failed" value={t.failed} tone="rose" />
        <SummaryCard label="Audience" value={t.audienceSize} tone="muted" />
      </div>

      {broadcast.status !== "completed" && broadcast.status !== "failed" && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {t.queued > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t.queued} still queued — sending at ~5/sec via QStash.
            </p>
          )}
        </div>
      )}

      {broadcast.errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {broadcast.errorMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recipients ({sends.length})
        </div>
        {sends.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No recipients yet.
          </div>
        ) : (
          <ul className="divide-y">
            {sends.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.toName || s.toEmail}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.toEmail}
                  </p>
                </div>
                <SendStatus send={s} />
                <span className="text-xs text-muted-foreground">
                  {formatContactDate(s.sentAt) === "—"
                    ? "—"
                    : formatRelativeTime(s.sentAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function audienceLabel(filter: BroadcastAudienceFilter): string {
  if (filter.kind === "all") return "All contacts";
  if (filter.kind === "tag") return `Tag: ${filter.tag}`;
  const stage = PIPELINE_STAGES.find((s) => s.id === filter.stage);
  return `Stage: ${stage?.label ?? filter.stage}`;
}

function SendStatus({ send }: { send: BroadcastSendDoc }) {
  if (send.status === "sent") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
        Sent
      </span>
    );
  }
  if (send.status === "queued") {
    return (
      <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-500/30 dark:text-slate-300">
        Queued
      </span>
    );
  }
  if (send.status === "skipped") {
    const reason =
      send.skippedReason === "opt_out"
        ? "Opted out"
        : send.skippedReason === "no_email"
          ? "No email"
          : send.skippedReason === "contact_missing"
            ? "Contact deleted"
            : "Skipped";
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">
        {reason}
      </span>
    );
  }
  return (
    <span
      title={send.error ?? undefined}
      className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300"
    >
      Failed
    </span>
  );
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
      className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${map[status]}`}
    >
      {status}
    </span>
  );
}

function SummaryCard({
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
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-mono text-2xl font-semibold ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}
