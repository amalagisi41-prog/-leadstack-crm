"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useInbox } from "@/lib/community/dm-hooks";
import { DmAvatar } from "./dm-avatar";
import type { DmInboxItem } from "@/types/community";

function timeAgo(ms: number | null): string {
  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function DmInbox({
  saId,
  brand,
  initialItems,
}: {
  saId: string;
  brand: string;
  initialItems: DmInboxItem[];
}) {
  const items = useInbox(saId, initialItems);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
        No messages yet. Open a member from the Members tab to start a chat.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#f0f0f0] overflow-hidden rounded-xl border border-[#E4E4E4] bg-white">
      {items.map((t) => (
        <Link
          key={t.threadId}
          href={`/c/${saId}/messages/${t.threadId}`}
          className="flex items-center gap-3 px-4 py-3 hover:bg-[#F8F7F5]"
        >
          <DmAvatar
            name={t.other.displayName}
            avatarUrl={t.other.avatarUrl}
            size={44}
            brand={brand}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "truncate text-sm",
                  t.unread ? "font-semibold text-[#202124]" : "text-[#202124]",
                )}
              >
                {t.other.displayName}
              </span>
              <span className="shrink-0 text-xs text-[#909090]">
                {timeAgo(t.lastAtMs)}
              </span>
            </div>
            <p
              className={cn(
                "truncate text-sm",
                t.unread ? "text-[#202124]" : "text-[#909090]",
              )}
            >
              {t.lastBody}
            </p>
          </div>
          {t.unread && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: brand }}
            />
          )}
        </Link>
      ))}
    </div>
  );
}
