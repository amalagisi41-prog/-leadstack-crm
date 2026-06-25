"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThreadMessages } from "@/lib/community/dm-hooks";
import { ActionsMenu } from "@/components/community/actions-menu";
import { DmAvatar } from "./dm-avatar";
import type { DmMemberView, DmMessageView } from "@/types/community";

export function DmThread({
  saId,
  threadId,
  viewerId,
  other,
  brand,
  initialMessages,
  blockedByMe: initialBlocked,
}: {
  saId: string;
  threadId: string;
  viewerId: string;
  other: DmMemberView;
  brand: string;
  initialMessages: DmMessageView[];
  blockedByMe: boolean;
}) {
  const { messages, addLocal } = useThreadMessages(saId, threadId, initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(initialBlocked);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastReadId = useRef<string | null>(null);

  // Auto-scroll on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Mark read when the latest message is from the other member.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (
      last &&
      last.senderId !== viewerId &&
      lastReadId.current !== last.id
    ) {
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
      if (!res.ok || !d.ok || !d.message) throw new Error(d.error ?? "Couldn't send");
      addLocal(d.message);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  async function toggleBlock() {
    const next = !blocked;
    setBlocked(next);
    const res = await fetch(`/api/community/${saId}/dm/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherId: other.memberId, blocked: next }),
    });
    if (!res.ok) {
      setBlocked(!next);
      toast.error("Couldn't update");
    } else {
      toast.success(next ? "Member blocked" : "Member un-blocked");
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-[#E4E4E4] bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link
            href={`/c/${saId}/messages`}
            className="text-[#909090] hover:text-[#202124]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <DmAvatar
            name={other.displayName}
            avatarUrl={other.avatarUrl}
            size={32}
            brand={brand}
          />
          <span className="flex-1 truncate text-sm font-semibold text-[#202124]">
            {other.displayName}
          </span>
          <ActionsMenu
            items={[
              {
                label: blocked ? "Un-block member" : "Block member",
                onClick: toggleBlock,
                destructive: !blocked,
              },
            ]}
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-2 px-4 py-4">
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
                    "max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
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

      <div className="border-t border-[#E4E4E4] bg-white">
        <div className="mx-auto flex max-w-2xl items-end gap-2 px-4 py-3">
          {blocked ? (
            <p className="flex-1 py-2 text-center text-sm text-[#909090]">
              You blocked this member. Un-block to send a message.
            </p>
          ) : (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Write a message…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-[#E4E4E4] bg-white px-3 py-2.5 text-sm text-[#3a3a44] outline-none placeholder:text-[#909090]"
              />
              <button
                onClick={send}
                disabled={sending}
                className="rounded-md px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: brand }}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
