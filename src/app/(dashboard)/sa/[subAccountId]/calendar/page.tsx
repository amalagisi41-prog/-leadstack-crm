"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToEvents } from "@/lib/firestore/events";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import type { CalendarEvent } from "@/types/events";
import type { Contact } from "@/types/contacts";
import { CalendarView } from "@/components/calendar/calendar-view";

export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    if (!filterReady) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    let eventsReady = false;
    let contactsReady = false;
    const settle = () => {
      if (eventsReady && contactsReady) setLoading(false);
    };
    const unsubE = subscribeToEvents(scope, { territoryFilter }, (l) => {
      setEvents(l);
      eventsReady = true;
      settle();
    });
    const unsubC = subscribeToContacts(scope, { territoryFilter }, (l) => {
      setContacts(l);
      contactsReady = true;
      settle();
    });
    return () => {
      unsubE();
      unsubC();
    };
  }, [user, agencyId, subAccountId, authLoading, filterReady, territoryFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Manual events — meetings, calls, reminders. Click any day to add
          something.
        </p>
      </div>

      {loading ? (
        <CalendarSkeleton />
      ) : (
        <CalendarView events={events} contacts={contacts} />
      )}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-7 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {Array.from({ length: 42 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[100px] border-b border-r bg-muted/10 last:border-r-0"
          >
            {i % 5 === 0 && (
              <div className="m-1.5 h-3 w-4 animate-pulse rounded bg-muted" />
            )}
          </div>
        ))}
      </div>
      <div className="sr-only">
        <CalendarDays />
      </div>
    </div>
  );
}
