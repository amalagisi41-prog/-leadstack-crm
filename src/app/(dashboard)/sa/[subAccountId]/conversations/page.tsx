"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToConversations } from "@/lib/firestore/conversations";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ConversationList } from "@/components/conversations/conversation-list";
import type { ConversationDoc } from "@/types/conversations";

type Filter = "all" | "unread";

export default function ConversationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, saPath } = useSubAccount();
  const [conversations, setConversations] = useState<ConversationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (authLoading || !user || !subAccountId) return;
    setLoading(true);
    const unsub = subscribeToConversations(subAccountId, (list) => {
      setConversations(list);
      setLoading(false);
    });
    return () => unsub();
  }, [user, subAccountId, authLoading]);

  const unreadTotal = conversations.filter(
    (c) => (c.unreadCount ?? 0) > 0,
  ).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "unread" && !((c.unreadCount ?? 0) > 0)) return false;
      if (!q) return true;
      return (
        (c.contactName ?? "").toLowerCase().includes(q) ||
        (c.contactPhone ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, filter, search]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conversations</h1>
        <p className="text-sm text-muted-foreground">
          Every SMS &amp; WhatsApp thread, one place — one row per contact.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterPill>
        <FilterPill
          active={filter === "unread"}
          onClick={() => setFilter("unread")}
        >
          Unread{unreadTotal > 0 ? ` (${unreadTotal})` : ""}
        </FilterPill>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : (
        <ConversationList
          conversations={visible}
          basePath={saPath("/conversations")}
        />
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-56 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
