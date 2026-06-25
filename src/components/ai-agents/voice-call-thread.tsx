"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Phone,
  PhoneCall,
  PhoneIncoming,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { subscribeToVoiceCall } from "@/lib/firestore/voice-calls";
import { subscribeToTask } from "@/lib/firestore/tasks";
import { markTaskComplete } from "@/lib/client/tasks";
import { formatRelativeTime } from "@/lib/format";
import type { Task } from "@/types/tasks";
import type { VoiceCall } from "@/types/voice";

interface Props {
  callId: string;
}

/**
 * Operator's read-only view of a single voice call. Shows:
 *   - Caller identity (captured name / phone / email if any)
 *   - High-level metadata: duration, ended reason, callback flag,
 *     linked Contact and Task
 *   - Vapi's plain-text summary
 *   - Full turn-by-turn transcript
 *
 * Mirrors the WebChatSessionThread shape so operators get a
 * consistent surface across channels. No live updates needed in
 * practice (the call already ended by the time this page loads),
 * but we still subscribe so any out-of-band re-extraction or
 * task-status change reflects without a manual refresh.
 */
export function VoiceCallThread({ callId }: Props) {
  const { subAccountId, isAdmin } = useSubAccount();
  const { user } = useAuth();
  const [call, setCall] = useState<VoiceCall | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToVoiceCall(
      subAccountId,
      callId,
      (c) => {
        setCall(c);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return () => unsub();
  }, [subAccountId, callId, isAdmin]);

  useEffect(() => {
    const taskId = call?.taskId;
    if (!taskId) {
      setTask(null);
      return;
    }
    const unsub = subscribeToTask(taskId, setTask);
    return () => unsub();
  }, [call?.taskId]);

  async function handleMarkDone() {
    if (!task || !user) return;
    setCompleting(true);
    try {
      await markTaskComplete(task.id, true);
      toast.success("Task marked done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Couldn't update task: ${msg}`);
    } finally {
      setCompleting(false);
    }
  }

  async function handleReopen() {
    if (!task || !user) return;
    setCompleting(true);
    try {
      await markTaskComplete(task.id, false);
      toast.success("Task reopened");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Couldn't update task: ${msg}`);
    } finally {
      setCompleting(false);
    }
  }

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Admin access required to view this call.
      </p>
    );
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading call…</p>;
  }

  if (!call) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/10 p-10 text-center">
        <h2 className="text-base font-semibold">Call not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been deleted, or the URL might be wrong.
        </p>
        <Link
          href={`/sa/${subAccountId}/ai-agents/voice/calls`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to calls
        </Link>
      </div>
    );
  }

  const isCaptured = !!call.contactId;
  const identityLine = isCaptured
    ? call.capturedName ||
      call.capturedEmail ||
      call.capturedPhone ||
      call.callerPhone ||
      "Captured caller"
    : call.callerPhone || "Web call / withheld number";

  return (
    <div className="space-y-5">
      <Link
        href={`/sa/${subAccountId}/ai-agents/voice/calls`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to calls
      </Link>

      {/* Call header card */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                isCaptured
                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <PhoneIncoming className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">{identityLine}</h2>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(call.createdAt)} · {formatDuration(call.durationSec)}
                {call.endedReason ? ` · ${call.endedReason}` : ""}
              </p>
            </div>
          </div>
          {call.contactId && (
            <Link
              href={`/sa/${subAccountId}/contacts/${call.contactId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
            >
              View contact
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>

        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          {call.callerPhone && (
            <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Caller">
              <a
                href={`tel:${call.callerPhone}`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {call.callerPhone}
              </a>
            </DetailRow>
          )}
          {call.toPhone && (
            <DetailRow
              icon={<PhoneCall className="h-3.5 w-3.5" />}
              label="Dialled"
            >
              <span className="text-foreground">{call.toPhone}</span>
            </DetailRow>
          )}
          {call.capturedEmail && (
            <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Email">
              <span className="text-foreground">{call.capturedEmail}</span>
            </DetailRow>
          )}
          {call.callbackRequested && (
            <DetailRow
              icon={<PhoneCall className="h-3.5 w-3.5" />}
              label="Callback"
            >
              <span className="font-medium text-violet-700 dark:text-violet-400">
                Requested
              </span>
            </DetailRow>
          )}
        </dl>

        {call.summary && (
          <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Summary
            </p>
            {call.summary}
          </div>
        )}
      </section>

      {/* Follow-up task card */}
      {task && (
        <section className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              {task.completed ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
              ) : (
                <Clock3 className="h-4 w-4 text-amber-600 dark:text-amber-500" />
              )}
              <span className="font-medium">
                {task.completed ? "Followed up" : "Pending follow-up"}
              </span>
              <span className="text-muted-foreground">— {task.title}</span>
            </div>
            <Button
              variant={task.completed ? "outline" : "default"}
              size="sm"
              onClick={task.completed ? handleReopen : handleMarkDone}
              disabled={completing}
            >
              {task.completed ? "Reopen" : "Mark done"}
            </Button>
          </div>
        </section>
      )}

      {/* Transcript */}
      <section className="rounded-2xl border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Transcript</h3>
        {call.transcript && call.transcript.length > 0 ? (
          <ol className="space-y-3">
            {call.transcript.map((turn, i) => (
              <li
                key={i}
                className={`flex gap-3 ${
                  turn.role === "user" ? "" : "flex-row-reverse text-right"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    turn.role === "user"
                      ? "bg-muted text-muted-foreground"
                      : "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                  }`}
                  title={turn.role}
                >
                  {turn.role === "user" ? (
                    <User className="h-3.5 w-3.5" />
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                </span>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    turn.role === "user"
                      ? "bg-muted/40 text-foreground"
                      : "bg-violet-500/10 text-foreground"
                  }`}
                >
                  {turn.content}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No transcript captured for this call. (Vapi may have skipped
            the analysis pass — check the call in your Vapi dashboard.)
          </p>
        )}
      </section>

      {call.errors && call.errors.length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-400">
          <p className="font-medium">Handler warnings</p>
          <ul className="mt-1 list-disc pl-4">
            {call.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-xs">{children}</span>
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (!sec || sec < 1) return "0s";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
