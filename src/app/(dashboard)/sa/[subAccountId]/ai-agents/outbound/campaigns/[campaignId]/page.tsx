"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  onSnapshot,
  query,
  type Timestamp,
} from "firebase/firestore";
import { ArrowLeft, Ban, Loader2, PhoneOff, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { formatContactDate, formatRelativeTime } from "@/lib/format";
import { PIPELINE_STAGES } from "@/types/deals";
import type {
  BroadcastAudienceFilter,
  VoiceCampaignDoc,
  VoiceCampaignOutcome,
  VoiceCampaignRecipientDoc,
  VoiceCampaignSkipReason,
} from "@/types";

/**
 * Voice campaign detail — totals header + live per-recipient table. Updates
 * via onSnapshot as the QStash fan-out drains (calls placed / skipped /
 * deferred to the calling window). Lives under the AI Agents → Outbound tab.
 */
export default function VoiceCampaignDetailPage() {
  const params = useParams<{ campaignId: string }>();
  const id = params.campaignId;
  const { saPath } = useSubAccount();
  const [campaign, setCampaign] = useState<VoiceCampaignDoc | null>(null);
  const [recipients, setRecipients] = useState<VoiceCampaignRecipientDoc[]>([]);
  const [loading, setLoading] = useState(true);
  // Tick every 15s so live-call evaluation + relative times refresh even
  // when no Firestore snapshot fires (a live call's doc doesn't change
  // until the end-of-call report lands).
  const [, forceTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => forceTick((t) => t + 1), 15000);
    return () => clearInterval(i);
  }, []);
  const [cancellingMode, setCancellingMode] = useState<
    "scheduled" | "all" | null
  >(null);

  async function stopCampaign(mode: "scheduled" | "all") {
    if (cancellingMode || !id) return;
    const confirmMsg =
      mode === "all"
        ? "Stop ALL calls now — including any in progress? Live calls are hung up immediately and queued contacts won't be called."
        : "Stop scheduled calls? Contacts not yet called won't be called. Calls already connected will finish on their own.";
    if (!window.confirm(confirmMsg)) return;
    setCancellingMode(mode);
    try {
      const res = await fetch("/api/comms/voice/campaign/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id, mode }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        stopped?: number;
        endedLive?: number;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't stop the campaign.");
        return;
      }
      const parts: string[] = [];
      if (typeof data.stopped === "number") {
        parts.push(
          `${data.stopped} pending call${data.stopped === 1 ? "" : "s"} cancelled`,
        );
      }
      if (mode === "all" && typeof data.endedLive === "number") {
        parts.push(
          `${data.endedLive} live call${data.endedLive === 1 ? "" : "s"} ended`,
        );
      }
      toast.success(
        `Campaign stopped${parts.length ? ` — ${parts.join(", ")}` : ""}.`,
      );
    } catch {
      toast.error("Network error — try again.");
    } finally {
      setCancellingMode(null);
    }
  }

  useEffect(() => {
    if (!id) return;
    const unsubCampaign = onSnapshot(
      doc(getFirebaseDb(), "voiceCampaigns", id),
      (snap) => {
        setCampaign(snap.exists() ? (snap.data() as VoiceCampaignDoc) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubRecs = onSnapshot(
      query(collection(getFirebaseDb(), "voiceCampaigns", id, "recipients")),
      (snap) => {
        const list = snap.docs.map(
          (d) => d.data() as VoiceCampaignRecipientDoc,
        );
        const order: Record<VoiceCampaignRecipientDoc["status"], number> = {
          failed: 0,
          queued: 1,
          called: 2,
          skipped: 3,
        };
        list.sort((a, b) => {
          const o = order[a.status] - order[b.status];
          if (o !== 0) return o;
          return a.toName.localeCompare(b.toName);
        });
        setRecipients(list);
      },
    );
    return () => {
      unsubCampaign();
      unsubRecs();
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
  if (!campaign) {
    return (
      <div className="space-y-4">
        <Link
          href={saPath("/ai-agents/outbound")}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Outbound
        </Link>
        <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
          <h3 className="text-base font-semibold">Campaign not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been deleted, or you don&apos;t have access.
          </p>
        </div>
      </div>
    );
  }

  const t = campaign.totals;
  const progress =
    t.audienceSize > 0
      ? Math.round(((t.called + t.skipped + t.failed) / t.audienceSize) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={saPath("/ai-agents/outbound")}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Outbound
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
                <PhoneOutgoing className="h-4 w-4" />
              </span>
              {campaign.name || audienceLabel(campaign.audienceFilter)}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {campaign.code && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-foreground">
                  {campaign.code}
                </span>
              )}
              <span className="text-muted-foreground">
                {audienceLabel(campaign.audienceFilter)}
              </span>
            </p>
            {campaign.openerPreview && (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Opener: &ldquo;{campaign.openerPreview}&rdquo;
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Started {formatRelativeTime(campaign.createdAt)} by{" "}
              {campaign.createdBy?.displayName ||
                campaign.createdBy?.email ||
                "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(campaign.status === "queued" || campaign.status === "calling") && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => stopCampaign("scheduled")}
                  disabled={cancellingMode !== null}
                  title="Stop dialing new contacts. Calls already connected finish on their own."
                >
                  {cancellingMode === "scheduled" ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Stopping…
                    </>
                  ) : (
                    <>
                      <Ban className="mr-1 h-3.5 w-3.5" />
                      Stop scheduled
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => stopCampaign("all")}
                  disabled={cancellingMode !== null}
                  title="Stop everything now — hang up live calls AND cancel queued ones."
                >
                  {cancellingMode === "all" ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Stopping…
                    </>
                  ) : (
                    <>
                      <PhoneOff className="mr-1 h-3.5 w-3.5" />
                      Stop all (live + scheduled)
                    </>
                  )}
                </Button>
              </>
            )}
            <StatusBadge status={campaign.status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Interested" value={t.interested ?? 0} tone="violet" />
        <SummaryCard label="Called" value={t.called} tone="emerald" />
        <SummaryCard label="Skipped" value={t.skipped} tone="muted" />
        <SummaryCard label="Failed" value={t.failed} tone="rose" />
        <SummaryCard label="Audience" value={t.audienceSize} tone="muted" />
      </div>

      {campaign.status !== "completed" && campaign.status !== "failed" && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-orange-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {t.queued > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t.queued} still queued — calls are paced, and any outside their
              local calling window are auto-deferred until it opens.
            </p>
          )}
        </div>
      )}

      {campaign.errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {campaign.errorMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recipients ({recipients.length})
        </div>
        {recipients.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No recipients yet.
          </div>
        ) : (
          <ul className="divide-y">
            {recipients.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={saPath(`/contacts/${r.contactId}`)}
                    className="truncate font-medium hover:text-primary hover:underline"
                  >
                    {r.toName || r.toPhone}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.toPhone}
                  </p>
                  {r.endedReason && (
                    <p className="mt-0.5 text-xs text-muted-foreground/80">
                      {humanizeEndedReason(r.endedReason)}
                    </p>
                  )}
                  {r.callSummary && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80">
                      {r.callSummary}
                    </p>
                  )}
                </div>
                {isRecipientLive(r) ? (
                  <LiveBadge />
                ) : (
                  <>
                    {r.outcome && <OutcomeBadge outcome={r.outcome} />}
                    <RecipientStatus rec={r} />
                  </>
                )}
                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                  {isRecipientLive(r) ? (
                    <span className="text-orange-600 dark:text-orange-400">
                      in progress
                    </span>
                  ) : r.status === "called" ? (
                    <span className="font-mono">
                      {formatDuration(r.callDurationSec ?? 0)}
                    </span>
                  ) : formatContactDate(r.settledAt) === "—" ? (
                    "—"
                  ) : (
                    formatRelativeTime(r.settledAt)
                  )}
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

const SKIP_LABELS: Record<VoiceCampaignSkipReason, string> = {
  opted_out: "Opted out",
  no_phone: "No phone",
  country_blocked: "Country blocked",
  daily_cap: "Daily cap hit",
  number_frequency: "Already called",
  scrub_blocked: "Screened out",
  window_unreached: "Window unreached",
  contact_missing: "Contact deleted",
  cancelled: "Stopped",
  recently_called: "Called recently",
  suppressed_tag: "Suppressed (tag)",
  prior_campaign: "In prior campaign",
};

/** A call is "live" once placed (status: called) until its end-of-call
 *  report lands (outcome set). Bounded to 15 min so a missed report can't
 *  leave a row pinned to LIVE forever. */
const LIVE_WINDOW_MS = 15 * 60 * 1000;
function isRecipientLive(r: VoiceCampaignRecipientDoc): boolean {
  if (r.status !== "called" || r.outcome) return false;
  const placed = r.settledAt as Timestamp | null | undefined;
  const ms =
    placed && typeof placed.toMillis === "function" ? placed.toMillis() : 0;
  if (!ms) return true; // just placed, server timestamp not yet resolved
  return Date.now() - ms < LIVE_WINDOW_MS;
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 ring-1 ring-orange-500/30 dark:text-orange-300">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
      </span>
      Live
    </span>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Turn Vapi's kebab ended reasons into readable text, e.g.
 *  "customer-did-not-answer" → "Customer did not answer". */
function humanizeEndedReason(reason: string): string {
  const cleaned = reason.replace(/[-_]+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const OUTCOME_META: Record<
  VoiceCampaignOutcome,
  { label: string; cls: string }
> = {
  interested: {
    label: "Interested",
    cls: "bg-violet-500/15 text-violet-700 ring-violet-500/30 dark:text-violet-300",
  },
  callback: {
    label: "Callback",
    cls: "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  },
  not_interested: {
    label: "Not interested",
    cls: "bg-slate-500/15 text-slate-600 ring-slate-500/30 dark:text-slate-300",
  },
  no_answer: {
    label: "No answer",
    cls: "bg-slate-500/15 text-slate-600 ring-slate-500/30 dark:text-slate-300",
  },
  voicemail: {
    label: "Voicemail",
    cls: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  },
  completed: {
    label: "Completed",
    cls: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  },
  failed: {
    label: "Failed",
    cls: "bg-rose-500/15 text-rose-700 ring-rose-500/30 dark:text-rose-300",
  },
};

function OutcomeBadge({ outcome }: { outcome: VoiceCampaignOutcome }) {
  const meta = OUTCOME_META[outcome];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function RecipientStatus({ rec }: { rec: VoiceCampaignRecipientDoc }) {
  if (rec.status === "called") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
        Called
      </span>
    );
  }
  if (rec.status === "queued") {
    return (
      <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-500/30 dark:text-slate-300">
        Queued
      </span>
    );
  }
  if (rec.status === "skipped") {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">
        {rec.skippedReason ? SKIP_LABELS[rec.skippedReason] : "Skipped"}
      </span>
    );
  }
  return (
    <span
      title={rec.error ?? undefined}
      className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300"
    >
      Failed
    </span>
  );
}

function StatusBadge({ status }: { status: VoiceCampaignDoc["status"] }) {
  const map: Record<VoiceCampaignDoc["status"], string> = {
    queued:
      "bg-slate-500/15 text-slate-700 ring-1 ring-slate-500/30 dark:text-slate-300",
    calling:
      "bg-orange-500/15 text-orange-700 ring-1 ring-orange-500/30 dark:text-orange-300",
    completed:
      "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300",
    cancelled:
      "bg-slate-500/15 text-slate-700 ring-1 ring-slate-500/30 dark:text-slate-300",
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
  tone: "emerald" | "rose" | "muted" | "violet";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "violet"
          ? "text-violet-600 dark:text-violet-400"
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
