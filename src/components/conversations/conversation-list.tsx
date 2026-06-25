"use client";

import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConversationDoc, ConversationChannel } from "@/types/conversations";

const CHANNEL_LABEL: Record<ConversationChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

const CHANNEL_BADGE: Record<ConversationChannel, string> = {
  sms: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  whatsapp: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  messenger: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  instagram: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
};

export function ConversationList({
  conversations,
  basePath,
}: {
  /** Pre-filtered + pre-sorted by the page. */
  conversations: ConversationDoc[];
  /** e.g. `/sa/{id}/conversations` — rows link to `{basePath}/{contactId}`. */
  basePath: string;
}) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MessagesSquare className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-base font-semibold">No conversations yet</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Inbound and outbound SMS / WhatsApp messages land here, one thread per
          contact. Send a message or wait for a customer to reply.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {conversations.map((c) => {
        const unread = (c.unreadCount ?? 0) > 0;
        const ts = toDate(c.lastMessageAt);
        const title = c.contactName || c.contactPhone || "Unknown contact";
        return (
          <Link
            key={c.id}
            href={`${basePath}/${c.contactId}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials(title)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-sm",
                    unread ? "font-semibold" : "font-medium",
                  )}
                >
                  {title}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {ts ? formatShort(ts) : ""}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-xs",
                    unread ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {c.lastDirection === "outbound" ? "You: " : ""}
                  {c.lastMessagePreview}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {c.pendingDraft && (
                    <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      Draft
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-medium",
                      CHANNEL_BADGE[c.lastChannel] ?? CHANNEL_BADGE.sms,
                    )}
                  >
                    {CHANNEL_LABEL[c.lastChannel] ?? c.lastChannel}
                  </span>
                  {unread && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
                      {c.unreadCount}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatShort(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 24 * 3600 * 1000) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
