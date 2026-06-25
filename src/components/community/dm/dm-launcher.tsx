"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/lib/community/dm-hooks";
import { DmAvatar } from "./dm-avatar";
import { DmThreadModal } from "./dm-thread-modal";
import type { DmInboxItem, DmMemberView } from "@/types/community";

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

/**
 * Skool-style messages launcher. The header message icon opens a "Chats" panel
 * (recent conversations + a search box that finds any member you share a group
 * with). Selecting anyone opens the conversation in a modal — no page
 * navigation. Replaces the old DmHeaderButton link.
 */
export function DmLauncher({
  saId,
  viewerId,
  brand,
}: {
  saId: string;
  viewerId: string;
  brand: string;
}) {
  const count = useUnreadCount(saId, 0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [active, setActive] = useState<DmMemberView | null>(null);

  const [inbox, setInbox] = useState<DmInboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DmMemberView[]>([]);
  const [searching, setSearching] = useState(false);

  // Load recent conversations whenever the panel opens (no always-on polling —
  // the unread badge already covers live notification).
  useEffect(() => {
    if (!panelOpen) return;
    let cancelled = false;
    setInboxLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/community/${saId}/dm/inbox`);
        if (!cancelled && res.ok) {
          const d = (await res.json()) as { items?: DmInboxItem[] };
          setInbox(Array.isArray(d.items) ? d.items : []);
        }
      } catch {
        /* transient */
      } finally {
        if (!cancelled) setInboxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panelOpen, saId]);

  // Debounced member search.
  useEffect(() => {
    const term = q.trim();
    if (!panelOpen || !term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/community/${saId}/dm/members?q=${encodeURIComponent(term)}`,
        );
        if (res.ok) {
          const d = (await res.json()) as { members?: DmMemberView[] };
          setResults(Array.isArray(d.members) ? d.members : []);
        }
      } catch {
        /* transient */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, panelOpen, saId]);

  function openThread(other: DmMemberView) {
    setActive(other);
    setPanelOpen(false);
  }

  const searching_ = q.trim().length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setPanelOpen((o) => !o)}
        className="relative rounded-full p-1.5 text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124]"
        title="Messages"
        aria-label="Messages"
      >
        <MessageSquare className="h-5 w-5" />
        {count > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: brand }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {panelOpen && (
        <>
          <button
            className="fixed inset-0 z-30 cursor-default"
            aria-hidden
            onClick={() => setPanelOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-[#E4E4E4] bg-white shadow-xl">
            <div className="shrink-0 border-b border-[#E4E4E4] px-4 py-3">
              <span className="text-sm font-semibold text-[#202124]">Chats</span>
            </div>
            <div className="shrink-0 px-3 pt-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#909090]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search users"
                  className="h-9 w-full rounded-md border border-[#E4E4E4] bg-white pl-8 pr-3 text-sm text-[#202124] outline-none placeholder:text-[#909090]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {searching_ ? (
                <SearchResults
                  searching={searching}
                  results={results}
                  brand={brand}
                  onPick={openThread}
                />
              ) : (
                <RecentList
                  loading={inboxLoading}
                  items={inbox}
                  brand={brand}
                  onPick={openThread}
                />
              )}
            </div>
          </div>
        </>
      )}

      {active && (
        <DmThreadModal
          saId={saId}
          viewerId={viewerId}
          other={active}
          brand={brand}
          onClose={() => setActive(null)}
          onBack={() => {
            setActive(null);
            setPanelOpen(true);
          }}
        />
      )}
    </div>
  );
}

function RecentList({
  loading,
  items,
  brand,
  onPick,
}: {
  loading: boolean;
  items: DmInboxItem[];
  brand: string;
  onPick: (m: DmMemberView) => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-[#909090]" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-[#909090]">
        No messages yet. Search for a member above to start a chat.
      </p>
    );
  }
  return (
    <div className="space-y-0.5">
      {items.map((t) => (
        <button
          key={t.threadId}
          onClick={() => onPick(t.other)}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#F8F7F5]"
        >
          <DmAvatar
            name={t.other.displayName}
            avatarUrl={t.other.avatarUrl}
            size={40}
            brand={brand}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "truncate text-sm",
                  t.unread
                    ? "font-semibold text-[#202124]"
                    : "text-[#202124]",
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
        </button>
      ))}
    </div>
  );
}

function SearchResults({
  searching,
  results,
  brand,
  onPick,
}: {
  searching: boolean;
  results: DmMemberView[];
  brand: string;
  onPick: (m: DmMemberView) => void;
}) {
  if (searching && results.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-[#909090]" />
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-[#909090]">
        No members found.
      </p>
    );
  }
  return (
    <div className="space-y-0.5">
      {results.map((m) => (
        <button
          key={m.memberId}
          onClick={() => onPick(m)}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#F8F7F5]"
        >
          <DmAvatar
            name={m.displayName}
            avatarUrl={m.avatarUrl}
            size={40}
            brand={brand}
          />
          <span className="min-w-0 flex-1 truncate text-sm text-[#202124]">
            {m.displayName}
          </span>
          <span className="shrink-0 text-xs font-medium text-[#909090]">
            Message
          </span>
        </button>
      ))}
    </div>
  );
}
