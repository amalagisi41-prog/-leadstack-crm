"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThreadMessages } from "@/lib/community/dm-hooks";
import { ActionsMenu } from "@/components/community/actions-menu";
import { DmAvatar } from "./dm-avatar";
import type { DmMemberView, DmMessageView } from "@/types/community";

/**
 * Skool-style conversation modal. Overlays the community surface instead of
 * navigating to a page. Loads the thread history (+ block state) on open, then
 * polls for new messages via the shared `useThreadMessages` hook. Light-themed
 * with explicit colors so it never dark-bleeds on /c/* (same reasoning as
 * ActionsMenu).
 */
export function DmThreadModal({
  saId,
  viewerId,
  other,
  brand,
  onClose,
  onBack,
}: {
  saId: string;
  viewerId: string;
  other: DmMemberView;
  brand: string;
  onClose: () => void;
  /** Optional: render a back arrow that returns to the Chats panel. */
  onBack?: () => void;
}) {
  const threadId = useMemo(
    () => [viewerId, other.memberId].sort().join("__"),
    [viewerId, other.memberId],
  );
  const [loaded, setLoaded] = useState(false);
  const [initial, setInitial] = useState<DmMessageView[]>([]);
  const [initialBlocked, setInitialBlocked] = useState(false);

  // Load history once on open (a brand-new chat 404s → empty thread).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/community/${saId}/dm/threads/${threadId}/messages`,
        );
        if (!cancelled && res.ok) {
          const d = (await res.json()) as {
            messages?: DmMessageView[];
            blockedByMe?: boolean;
          };
          setInitial(Array.isArray(d.messages) ? d.messages : []);
          setInitialBlocked(d.blockedByMe === true);
        }
      } catch {
        /* new chat or transient error — start empty */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saId, threadId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        className="absolute inset-0 cursor-default bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex h-[600px] max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#E4E4E4] px-3">
          {onBack && (
            <button
              onClick={onBack}
              className="rounded-full p-1.5 text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124]"
              title="Back to chats"
              aria-label="Back to chats"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <DmAvatar
            name={other.displayName}
            avatarUrl={other.avatarUrl}
            size={32}
            brand={brand}
          />
          <span className="flex-1 truncate text-sm font-semibold text-[#202124]">
            {other.displayName}
          </span>
          <ThreadActions
            saId={saId}
            otherId={other.memberId}
            initialBlocked={initialBlocked}
            ready={loaded}
          />
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124]"
            title="Close"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {loaded ? (
          <ThreadBody
            saId={saId}
            threadId={threadId}
            viewerId={viewerId}
            other={other}
            brand={brand}
            initialMessages={initial}
            initialBlocked={initialBlocked}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#909090]" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Block/un-block menu, hoisted so it has its own state independent of load. */
function ThreadActions({
  saId,
  otherId,
  initialBlocked,
  ready,
}: {
  saId: string;
  otherId: string;
  initialBlocked: boolean;
  ready: boolean;
}) {
  const [blocked, setBlocked] = useState(initialBlocked);
  useEffect(() => {
    if (ready) setBlocked(initialBlocked);
  }, [ready, initialBlocked]);

  async function toggleBlock() {
    const next = !blocked;
    setBlocked(next);
    const res = await fetch(`/api/community/${saId}/dm/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherId, blocked: next }),
    });
    if (!res.ok) {
      setBlocked(!next);
      toast.error("Couldn't update");
    } else {
      toast.success(next ? "Member blocked" : "Member un-blocked");
    }
  }

  return (
    <ActionsMenu
      items={[
        {
          label: blocked ? "Un-block member" : "Block member",
          onClick: toggleBlock,
          destructive: !blocked,
        },
      ]}
    />
  );
}

function ThreadBody({
  saId,
  threadId,
  viewerId,
  other,
  brand,
  initialMessages,
  initialBlocked,
}: {
  saId: string;
  threadId: string;
  viewerId: string;
  other: DmMemberView;
  brand: string;
  initialMessages: DmMessageView[];
  initialBlocked: boolean;
}) {
  const { messages, addLocal } = useThreadMessages(saId, threadId, initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastReadId = useRef<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Mark read when the latest message is from the other member.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.senderId !== viewerId && lastReadId.current !== last.id) {
      lastReadId.current = last.id;
      void fetch(`/api/community/${saId}/dm/threads/${threadId}/read`, {
        method: "POST",
      });
    }
  }, [messages, saId, threadId, viewerId]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const res = await fetch(`/api/community/${saId}/dm/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherId: other.memberId, body }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: DmMessageView;
        error?: string;
      };
      if (!res.ok || !d.ok || !d.message)
        throw new Error(d.error ?? "Couldn't send");
      addLocal(d.message);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-2">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-[#909090]">
              Say hello to {other.displayName}.
            </p>
          )}
          {messages.map((m) => {
            const mine = m.senderId === viewerId;
            return (
              <div
                key={m.id}
                className={cn("flex", mine ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                    mine ? "text-white" : "bg-[#ececec] text-[#202124]",
                  )}
                  style={mine ? { backgroundColor: brand } : undefined}
                >
                  {m.body}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-[#E4E4E4] px-3 py-3">
        {initialBlocked ? (
          <p className="py-2 text-center text-sm text-[#909090]">
            You blocked this member. Un-block to send a message.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={`Message ${other.displayName}`}
              rows={1}
              autoFocus
              className="flex-1 resize-none rounded-xl border border-[#E4E4E4] bg-white px-3 py-2.5 text-sm text-[#3a3a44] outline-none placeholder:text-[#909090]"
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              className="rounded-md px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: brand }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
