"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Globe,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import {
  subscribeToWebChatMessages,
  subscribeToWebChatSession,
} from "@/lib/firestore/web-chat-sessions";
import { subscribeToTask } from "@/lib/firestore/tasks";
import { markTaskComplete } from "@/lib/client/tasks";
import { formatRelativeTime } from "@/lib/format";
import type { Task } from "@/types/tasks";
import type { WebChatMessage, WebChatSession } from "@/types/web-chat";

interface Props {
  sessionId: string;
}

/**
 * Operator's read-only view of a single Web Chat session.
 * Left/top: session metadata (visitor identity, captured fields, source page,
 * status). Below: live message transcript that updates in real time as
 * the visitor chats. Messages are not editable; this is a monitoring view
 * (Phase 2's "operator takeover" is a separate decision).
 */
export function WebChatSessionThread({ sessionId }: Props) {
  const { subAccountId, isAdmin } = useSubAccount();
  const { user } = useAuth();
  const [session, setSession] = useState<WebChatSession | null>(null);
  const [messages, setMessages] = useState<WebChatMessage[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubSession = subscribeToWebChatSession(
      subAccountId,
      sessionId,
      (s) => {
        setSession(s);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    const unsubMessages = subscribeToWebChatMessages(
      subAccountId,
      sessionId,
      setMessages,
    );
    return () => {
      unsubSession();
      unsubMessages();
    };
  }, [subAccountId, sessionId, isAdmin]);

  // Subscribe to the linked follow-up task once we know its id.
  useEffect(() => {
    const taskId = session?.pendingFollowUpTaskId;
    if (!taskId) {
      setTask(null);
      return;
    }
    const unsub = subscribeToTask(taskId, setTask);
    return () => unsub();
  }, [session?.pendingFollowUpTaskId]);

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
        Admin access required to view this session.
      </p>
    );
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading session…</p>;
  }

  if (!session) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/10 p-10 text-center">
        <h2 className="text-base font-semibold">Session not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been deleted, or the URL might be wrong.
        </p>
        <Link
          href={`/sa/${subAccountId}/ai-agents/web-chat/sessions`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sessions
        </Link>
      </div>
    );
  }

  const isCaptured = !!session.contactId;
  const identityLine = isCaptured
    ? session.capturedName ||
      session.capturedEmail ||
      session.capturedPhone ||
      "Captured visitor"
    : "Anonymous visitor";

  return (
    <div className="space-y-5">
      <Link
        href={`/sa/${subAccountId}/ai-agents/web-chat/sessions`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sessions
      </Link>

      {/* Session header card */}
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
              <User className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">{identityLine}</h2>
              <p className="text-xs text-muted-foreground">
                Started{" "}
                {formatRelativeTime(session.createdAt)} · last active{" "}
                {formatRelativeTime(session.lastMessageAt ?? session.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={session.status} />
            {session.captureSkipped && (
              <span className="text-[10px] text-muted-foreground">
                Visitor skipped capture form
              </span>
            )}
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
          {session.capturedEmail && (
            <MetaRow icon={<Mail className="h-3.5 w-3.5" />} label="Email">
              <a
                href={`mailto:${session.capturedEmail}`}
                className="text-foreground underline-offset-2 hover:underline"
              >
                {session.capturedEmail}
              </a>
            </MetaRow>
          )}
          {session.capturedPhone && (
            <MetaRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone">
              <a
                href={`tel:${session.capturedPhone}`}
                className="text-foreground underline-offset-2 hover:underline"
              >
                {session.capturedPhone}
              </a>
            </MetaRow>
          )}
          {session.pageUrl && (
            <MetaRow icon={<Globe className="h-3.5 w-3.5" />} label="Page">
              <a
                href={session.pageUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-foreground underline-offset-2 hover:underline"
              >
                {session.pageUrl}
              </a>
            </MetaRow>
          )}
          {session.contactId && (
            <MetaRow icon={<User className="h-3.5 w-3.5" />} label="Contact">
              <Link
                href={`/sa/${subAccountId}/contacts/${session.contactId}`}
                className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
              >
                Open contact record
                <ExternalLink className="h-3 w-3" />
              </Link>
            </MetaRow>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            <strong className="text-foreground">{session.messageCount}</strong>{" "}
            messages
          </span>
          <span>
            <strong className="text-foreground">{session.tokensUsed}</strong>{" "}
            tokens
          </span>
          {session.referrer && (
            <span className="truncate">
              Referrer: <span className="text-foreground">{session.referrer}</span>
            </span>
          )}
        </div>
      </section>

      {/* Follow-up task — only shown when one was auto-created on capture */}
      {task && (
        <section
          className={`rounded-2xl border p-5 ${
            task.completed
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  task.completed
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                }`}
              >
                {task.completed ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Clock3 className="h-4 w-4" />
                )}
              </span>
              <div>
                <h3 className="text-sm font-semibold">
                  {task.completed ? "Follow-up done" : "Pending follow-up"}
                </h3>
                <p className="mt-0.5 text-sm">{task.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {task.completed && task.completedAt
                    ? `Completed ${formatRelativeTime(task.completedAt)}`
                    : task.dueAt
                      ? `Due ${formatRelativeTime(task.dueAt)}`
                      : "No due date"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/sa/${subAccountId}/tasks`}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                Open in Tasks
                <ExternalLink className="h-3 w-3" />
              </Link>
              {task.completed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleReopen}
                  disabled={completing}
                >
                  Reopen
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleMarkDone}
                  disabled={completing}
                >
                  Mark done
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Transcript */}
      <section className="rounded-2xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Transcript</h3>
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No messages yet on this session.
          </p>
        ) : (
          <ol className="space-y-3">
            {messages.map((m) => (
              <TranscriptRow key={m.id} message={m} />
            ))}
          </ol>
        )}
      </section>

      {session.status === "escalated" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Escalation triggered.</strong> The visitor used an
            escalation keyword — the bot has stopped replying. Follow up
            manually via the captured email/phone above.
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 truncate">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 truncate">
        <span className="text-muted-foreground">{label}:</span>{" "}
        <span className="truncate">{children}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "escalated"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : status === "active"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}

function TranscriptRow({ message }: { message: WebChatMessage }) {
  const isOutbound = message.direction === "outbound";
  const isSubmission = message.body.startsWith("(submitted via form)");
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isOutbound
            ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
            : isSubmission
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {isOutbound ? (
          <Bot className="h-3.5 w-3.5" />
        ) : (
          <User className="h-3.5 w-3.5" />
        )}
      </span>
      <div className="flex-1 rounded-xl border bg-background p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {isOutbound ? "Bot" : isSubmission ? "Form submission" : "Visitor"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(message.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-[13px]">{message.body}</p>
      </div>
    </li>
  );
}
