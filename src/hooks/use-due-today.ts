"use client";

import { useEffect, useState } from "react";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { toDate } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useOptionalSubAccount } from "@/context/sub-account-context";

/**
 * Number of incomplete tasks due today (or overdue) for the active
 * sub-account. The Sidebar renders this as a badge next to the Tasks nav
 * item, so it has to work both inside `/sa/[subAccountId]/...` (where the
 * provider exposes the active scope) and at agency-level pages (where we
 * fall back to the user's first sub-account membership).
 */
export function useDueTodayCount(): number {
  const { user, memberships } = useAuth();
  const sub = useOptionalSubAccount();
  const [count, setCount] = useState(0);

  const fallback = memberships[0];
  const subAccountId = sub?.subAccountId ?? fallback?.subAccountId ?? null;
  const agencyId = sub?.agencyId ?? fallback?.agencyId ?? null;

  useEffect(() => {
    if (!user || !subAccountId || !agencyId) {
      setCount(0);
      return;
    }
    const unsub = subscribeToTasks(
      { agencyId, subAccountId },
      (tasks) => {
        const now = Date.now();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 1);
        let n = 0;
        for (const t of tasks) {
          if (t.completed) continue;
          const d = toDate(t.dueAt);
          if (!d) continue;
          // overdue or due today
          if (d.getTime() < nextDay.getTime() || d.getTime() < now) {
            n += 1;
          }
        }
        setCount(n);
      },
    );
    return () => unsub();
  }, [user, subAccountId, agencyId]);

  return count;
}
