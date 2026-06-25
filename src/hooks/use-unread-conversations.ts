"use client";

import { useEffect, useState } from "react";
import { subscribeToConversations } from "@/lib/firestore/conversations";
import { useAuth } from "@/hooks/use-auth";
import { useOptionalSubAccount } from "@/context/sub-account-context";

/**
 * Number of conversations with unread inbound messages for the active
 * sub-account. The Sidebar renders this as a badge next to Conversations.
 * Works inside `/sa/[subAccountId]/...` (provider exposes scope) and at
 * agency-level pages (falls back to the user's first membership) — same
 * pattern as useDueTodayCount.
 */
export function useUnreadConversationsCount(): number {
  const { user, memberships } = useAuth();
  const sub = useOptionalSubAccount();
  const [count, setCount] = useState(0);

  const fallback = memberships[0];
  const subAccountId = sub?.subAccountId ?? fallback?.subAccountId ?? null;

  useEffect(() => {
    if (!user || !subAccountId) {
      setCount(0);
      return;
    }
    const unsub = subscribeToConversations(subAccountId, (rows) => {
      setCount(rows.filter((c) => (c.unreadCount ?? 0) > 0).length);
    });
    return () => unsub();
  }, [user, subAccountId]);

  return count;
}
