"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  PhoneCall,
  PhoneIncoming,
  UserCircle,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToVoiceCalls } from "@/lib/firestore/voice-calls";
import { subscribeToTask } from "@/lib/firestore/tasks";
import { formatRelativeTime } from "@/lib/format";
import type { Task } from "@/types/tasks";
import type { VoiceCall } from "@/types/voice";

/**
 * Operator console for the Voice channel. Subscribes to the
 * sub-account's `voiceCalls` collection so newly-finished calls
 * appear at the top in real time. Mirrors the WebChatSessionsList
 * shape so operators get a consistent surface across channels.
 *
 * Filter pills mirror Web Chat where they make sense (Pending /
 * Captured / Anonymous) and add voice-specific filters (Callback
 * requested) for the operator's primary use case: "who do I need
 * to call back?".
 */
export function VoiceCallsList() {
  const { subAccountId, isAdmin } = useSubAccount();
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "pending" | "callback" | "captured" | "anonymous"
  >("all");
  /** Map of callId → "open" | "done" | "missing" so the list can
   *  filter by pending state without re-subscribing for every render. */
  const [taskStates, setTaskStates] = useState<
    Record<string, "open" | "done" | "missing">
  >({});

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToVoiceCalls(
      subAccountId,
      (c) => {
        setCalls(c);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return () => unsub();
  }, [subAccountId, isAdmin]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "pending":
        return calls.filter((c) => taskStates[c.id] === "open");
      case "callback":
        return calls.filter((c) => c.callbackRequested);
      case "captured":
        return calls.filter((c) => !!c.contactId);
      case "anonymous":
        return calls.filter((c) => !c.contactId);
      default:
        return calls;
    }
  }, [calls, filter, taskStates]);

  const counts = useMemo(
    () => ({
      total: calls.length,
      pending: calls.filter((c) => taskStates[c.id] === "open").length,
      callback: calls.filter((c) => c.callbackRequested).length,
      captured: calls.filter((c) => !!c.contactId).length,
      anonymous: calls.filter((c) => !c.contactId).length,
    }),
    [calls, taskStates],
  );

  const reportTaskState = (
    callId: string,
    state: "open" | "done" | "missing",
  ) => {
    setTaskStates((prev) =>
      prev[callId] === state ? prev : { ...prev, [callId]: state },
    );
  };

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Admin access required to view calls.
      </p>
    );
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading calls…</p>;
  }

  if (calls.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/10 p-10 text-center">
        <PhoneCall className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 text-base font-semibold">No calls yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          When a caller dials the configured number, their call summary
          will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          label={`All ${counts.total}`}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterPill
          label={`Pending follow-up ${counts.pending}`}
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
          tone="amber"
        />
        <FilterPill
          label={`Callback requested ${counts.callback}`}
          active={filter === "callback"}
          onClick={() => setFilter("callback")}
        />
        <FilterPill
          label={`Captured ${counts.captured}`}
          active={filter === "captured"}
          onClick={() => setFilter("captured")}
        />
        <FilterPill
          label={`Anonymous ${counts.anonymous}`}
          active={filter === "anonymous"}
          onClick={() => setFilter("anonymous")}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border bg-muted/10 p-6 text-center text-sm text-muted-foreground">
          No calls match this filter.
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {filtered.map((call) => (
            <li key={call.id}>
              <CallRow
                subAccountId={subAccountId}
                call={call}
                onTaskState={(state) => reportTaskState(call.id, state)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  tone = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "amber";
}) {
  const inactiveClass =
    tone === "amber"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
      : "border-input bg-background text-muted-foreground hover:bg-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : inactiveClass
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Single row in the calls list. Subscribes to the linked Task (if any)
 * so the Open/Closed badge updates live as operators mark tasks done
 * from anywhere in the app. Collapsed by default; expanding shows the
 * call summary inline — full transcript lives on the detail page.
 */
function CallRow({
  subAccountId,
  call,
  onTaskState,
}: {
  subAccountId: string;
  call: VoiceCall;
  onTaskState: (state: "open" | "done" | "missing") => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const taskId = call.taskId;
    if (!taskId) {
      onTaskState("missing");
      setTask(null);
      return;
    }
    const unsub = subscribeToTask(taskId, (t) => {
      setTask(t);
      if (!t) onTaskState("missing");
      else onTaskState(t.completed ? "done" : "open");
    });
    return () => unsub();
  }, [call.taskId, onTaskState]);

  const isCaptured = !!call.contactId;
  const identityLine = isCaptured
    ? call.capturedName ||
      call.capturedEmail ||
      call.capturedPhone ||
      call.callerPhone ||
      "Captured caller"
    : call.callerPhone || "Web call / withheld number";

  const detailHref = `/sa/${subAccountId}/ai-agents/voice/calls/${call.id}`;

  return (
    <div className="relative">
      <Link
        href={detailHref}
        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40"
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            isCaptured
              ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isCaptured ? (
            <UserCircle className="h-4 w-4" />
          ) : (
            <PhoneIncoming className="h-4 w-4" />
          )}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {identityLine}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {task && !task.completed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <Clock3 className="h-3 w-3" />
              Pending
            </span>
          )}
          {task?.completed && (
            <span title="Followed up">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
            </span>
          )}
          {call.callbackRequested && !task && (
            <span title="Callback requested">
              <PhoneCall className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {formatDuration(call.durationSec)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatRelativeTime(call.createdAt)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-label={expanded ? "Collapse call" : "Expand call"}
            aria-expanded={expanded}
            className="-mr-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </Link>

      {expanded && (
        <div className="space-y-2 border-t bg-muted/20 px-4 py-3 pl-[60px]">
          {call.summary ? (
            <p className="line-clamp-3 text-[12px] text-muted-foreground">
              {call.summary}
            </p>
          ) : (
            <p className="text-[12px] italic text-muted-foreground">
              No summary available.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {call.callbackRequested && (
              <Badge tone="violet">Callback requested</Badge>
            )}
            {call.endedReason && (
              <Badge tone="neutral">{call.endedReason}</Badge>
            )}
            {task && !task.completed && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-500">
                <Clock3 className="h-3 w-3" />
                Pending follow-up
              </span>
            )}
            {task?.completed && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-500">
                <CheckCircle2 className="h-3 w-3" />
                Followed up
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {call.transcript?.length ?? 0} turns
            </span>
            <Link
              href={detailHref}
              className="ml-auto text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              Open transcript →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "neutral" | "amber" | "violet";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : tone === "violet"
        ? "bg-violet-500/15 text-violet-700 dark:text-violet-400"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${toneClass}`}
    >
      {children}
    </span>
  );
}

function formatDuration(sec: number): string {
  if (!sec || sec < 1) return "0s";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
