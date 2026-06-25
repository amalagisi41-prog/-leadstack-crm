"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  MessageCircle,
  User,
  UserCircle,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToWebChatMessages,
  subscribeToWebChatSessions,
} from "@/lib/firestore/web-chat-sessions";
import { subscribeToTask } from "@/lib/firestore/tasks";
import { formatRelativeTime } from "@/lib/format";
import type { Task } from "@/types/tasks";
import type { WebChatMessage, WebChatSession } from "@/types/web-chat";

/**
 * Live inbox of Web Chat sessions for the operator. Subscribes to the
 * sub-account's webChatSessions collection via onSnapshot so a visitor
 * chatting right now appears + bumps to the top in real time. Sorted
 * by lastMessageAt client-side.
 *
 * Each row links to the detail page where the full transcript lives.
 */
export function WebChatSessionsList() {
  const { subAccountId, isAdmin } = useSubAccount();
  const [sessions, setSessions] = useState<WebChatSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "captured" | "anonymous" | "escalated" | "pending"
  >("all");
  /** Map of sessionId → "open" | "done" | "missing" so the list can
   *  filter by pending state without re-subscribing for every render. */
  const [taskStates, setTaskStates] = useState<
    Record<string, "open" | "done" | "missing">
  >({});

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToWebChatSessions(
      subAccountId,
      (s) => {
        setSessions(s);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return () => unsub();
  }, [subAccountId, isAdmin]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "captured":
        return sessions.filter((s) => !!s.contactId);
      case "anonymous":
        return sessions.filter((s) => !s.contactId);
      case "escalated":
        return sessions.filter((s) => s.status === "escalated");
      case "pending":
        return sessions.filter((s) => taskStates[s.id] === "open");
      default:
        return sessions;
    }
  }, [sessions, filter, taskStates]);

  const counts = useMemo(
    () => ({
      total: sessions.length,
      captured: sessions.filter((s) => !!s.contactId).length,
      anonymous: sessions.filter((s) => !s.contactId).length,
      escalated: sessions.filter((s) => s.status === "escalated").length,
      pending: sessions.filter((s) => taskStates[s.id] === "open").length,
    }),
    [sessions, taskStates],
  );

  const reportTaskState = (
    sessionId: string,
    state: "open" | "done" | "missing",
  ) => {
    setTaskStates((prev) =>
      prev[sessionId] === state ? prev : { ...prev, [sessionId]: state },
    );
  };

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Admin access required to view sessions.
      </p>
    );
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading sessions…</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/10 p-10 text-center">
        <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 text-base font-semibold">No sessions yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          When a visitor opens the chat on the client&rsquo;s site, their
          session will appear here in real time.
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
          label={`Captured ${counts.captured}`}
          active={filter === "captured"}
          onClick={() => setFilter("captured")}
        />
        <FilterPill
          label={`Anonymous ${counts.anonymous}`}
          active={filter === "anonymous"}
          onClick={() => setFilter("anonymous")}
        />
        <FilterPill
          label={`Escalated ${counts.escalated}`}
          active={filter === "escalated"}
          onClick={() => setFilter("escalated")}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border bg-muted/10 p-6 text-center text-sm text-muted-foreground">
          No sessions match this filter.
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {filtered.map((session) => (
            <li key={session.id}>
              <SessionRow
                subAccountId={subAccountId}
                session={session}
                onTaskState={(state) => reportTaskState(session.id, state)}
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
 * Single row in the sessions list. Pulls the latest message via its own
 * lightweight onSnapshot — we only need the most recent body to preview,
 * not the full transcript, so the subscription is scoped tight.
 */
function SessionRow({
  subAccountId,
  session,
  onTaskState,
}: {
  subAccountId: string;
  session: WebChatSession;
  onTaskState: (state: "open" | "done" | "missing") => void;
}) {
  const [latestMessage, setLatestMessage] = useState<WebChatMessage | null>(
    null,
  );
  const [task, setTask] = useState<Task | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsub = subscribeToWebChatMessages(
      subAccountId,
      session.id,
      (msgs) => {
        setLatestMessage(msgs.length > 0 ? msgs[msgs.length - 1] : null);
      },
    );
    return () => unsub();
  }, [subAccountId, session.id]);

  // Subscribe to the linked follow-up task so the badge updates live as
  // the operator marks it done from the Tasks page or elsewhere.
  useEffect(() => {
    const taskId = session.pendingFollowUpTaskId;
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
  }, [session.pendingFollowUpTaskId, onTaskState]);

  const isCaptured = !!session.contactId;
  const identityLine = isCaptured
    ? session.capturedName ||
      session.capturedEmail ||
      session.capturedPhone ||
      "Captured visitor"
    : "Anonymous visitor";
  const subline = isCaptured
    ? [session.capturedEmail, session.capturedPhone].filter(Boolean).join(" · ")
    : session.pageUrl
      ? hostnameFrom(session.pageUrl)
      : "Unknown source";

  const detailHref = `/sa/${subAccountId}/ai-agents/web-chat/sessions/${session.id}`;

  // The collapsed row only renders the meaningful signals — drop the
  // always-on "active" pill (it carries no information; every session
  // is active by default and there's no auto-close transition yet).
  // Status pill only appears when status is something operator-relevant
  // (escalated). Follow-up state lives in its own badge.
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
            <User className="h-4 w-4" />
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
          {session.status === "escalated" && (
            <span title="Escalated">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {formatRelativeTime(session.lastMessageAt ?? session.createdAt)}
          </span>
          {/* Chevron button — toggles inline expand WITHOUT navigating.
              preventDefault() stops the parent <Link> from firing. */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-label={expanded ? "Collapse session" : "Expand session"}
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
          <p className="truncate text-[12px] text-muted-foreground">{subline}</p>
          {latestMessage && (
            <p className="line-clamp-2 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground/70">
                {latestMessage.direction === "outbound" ? "Bot:" : "Visitor:"}
              </span>{" "}
              {latestMessage.body}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {session.status === "escalated" && (
              <Badge tone="amber">Escalated</Badge>
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
              {session.messageCount} msg
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
  tone: "neutral" | "amber" | "green";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : tone === "green"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${toneClass}`}
    >
      {children}
    </span>
  );
}

function hostnameFrom(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 60);
  }
}
