"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  Search,
  User,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import {
  subscribeToBookingPage,
  subscribeToBookingPageEvents,
} from "@/lib/firestore/booking-pages";
import { Input } from "@/components/ui/input";
import { EventDialog } from "@/components/calendar/event-dialog";
import { toDate } from "@/lib/format";
import { eventStatus, type CalendarEvent, type EventStatus } from "@/types/events";
import type { BookingPage } from "@/types/booking";
import type { Contact } from "@/types/contacts";

/**
 * Per-booking-page bookings list. Filter chips bucket by lifecycle so
 * an operator can sweep "Awaiting payment" without scanning the
 * calendar.
 *
 * Reuses the existing event dialog (with the BookingActionsPanel from
 * Slice 8) so the operator stays in a single mental model — booking
 * actions live on the event row, not in a second-class UI here.
 */

type FilterKey =
  | "all"
  | "upcoming"
  | "awaiting_payment"
  | "completed"
  | "cancelled"
  | "no_show";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "completed", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
  { key: "no_show", label: "No-show" },
];

export default function BookingsListPage() {
  const params = useParams<{ subAccountId: string; slug: string }>();
  const slug = params.slug;
  const { subAccountId, saPath } = useSubAccount();
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [page, setPage] = useState<BookingPage | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("upcoming");
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (!subAccountId || !slug) return;
    const unsubPage = subscribeToBookingPage(subAccountId, slug, setPage);
    const unsubEvents = subscribeToBookingPageEvents(
      subAccountId,
      slug,
      (list) => {
        setEvents(list);
        setLoaded(true);
      },
    );
    return () => {
      unsubPage();
      unsubEvents();
    };
  }, [subAccountId, slug]);

  useEffect(() => {
    if (!subAccountId || !filterReady) return;
    const unsub = subscribeToContacts(
      { agencyId: "", subAccountId }, // agencyId only used for create paths
      { territoryFilter },
      setContacts,
    );
    return () => unsub();
  }, [subAccountId, filterReady, territoryFilter]);

  // Apply territory scoping client-side. Collaborators only see
  // bookings whose territoryId is in their filter (admins see all).
  const scopedEvents = useMemo(() => {
    if (!territoryFilter) return events;
    return events.filter((e) => {
      const tid = e.territoryId ?? null;
      return tid && territoryFilter.includes(tid);
    });
  }, [events, territoryFilter]);

  const contactsById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const now = Date.now();
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedEvents.filter((e) => {
      const status = eventStatus(e);
      const startMs = toDate(e.startAt)?.getTime() ?? 0;
      const isPast = startMs < now;

      // Filter chip.
      if (filter === "upcoming") {
        if (status !== "scheduled" || isPast) return false;
      } else if (filter === "awaiting_payment") {
        if (status !== "awaiting_payment") return false;
      } else if (filter === "completed") {
        // "Past" bucket: scheduled-but-past OR explicitly completed.
        if (!(status === "completed" || (status === "scheduled" && isPast))) {
          return false;
        }
      } else if (filter === "cancelled") {
        if (status !== "cancelled") return false;
      } else if (filter === "no_show") {
        if (status !== "no_show") return false;
      }

      // Search.
      if (q) {
        const contact = e.contactId ? contactsById.get(e.contactId) : null;
        const hay = [
          e.title,
          contact?.name,
          contact?.email,
          contact?.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopedEvents, filter, search, contactsById, now]);

  const counts = useMemo(() => {
    const out: Record<FilterKey, number> = {
      all: scopedEvents.length,
      upcoming: 0,
      awaiting_payment: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
    for (const e of scopedEvents) {
      const status = eventStatus(e);
      const startMs = toDate(e.startAt)?.getTime() ?? 0;
      const isPast = startMs < now;
      if (status === "scheduled" && !isPast) out.upcoming++;
      else if (status === "scheduled" && isPast) out.completed++;
      else if (status === "completed") out.completed++;
      else if (status === "awaiting_payment") out.awaiting_payment++;
      else if (status === "cancelled") out.cancelled++;
      else if (status === "no_show") out.no_show++;
    }
    return out;
  }, [scopedEvents, now]);

  return (
    <div className="space-y-6">
      <Link
        href={saPath(`/booking/${slug}`)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to page
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {page?.name ?? "Bookings"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {counts.all} total · {counts.upcoming} upcoming
          {counts.awaiting_payment > 0
            ? ` · ${counts.awaiting_payment} awaiting payment`
            : ""}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count = counts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                filter === f.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-input bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  filter === f.key ? "bg-background/20" : "bg-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, phone…"
          className="pl-8"
        />
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          {filter === "upcoming"
            ? "No upcoming bookings."
            : filter === "awaiting_payment"
              ? "No bookings awaiting payment."
              : `No bookings in this view.`}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredEvents.map((e) => (
            <BookingRow
              key={e.id}
              event={e}
              contact={
                e.contactId ? (contactsById.get(e.contactId) ?? null) : null
              }
              onClick={() => setSelectedEvent(e)}
            />
          ))}
        </ul>
      )}

      <EventDialog
        open={!!selectedEvent}
        onOpenChange={(o) => {
          if (!o) setSelectedEvent(null);
        }}
        contacts={contacts}
        event={selectedEvent}
      />
    </div>
  );
}

function BookingRow({
  event,
  contact,
  onClick,
}: {
  event: CalendarEvent;
  contact: Contact | null;
  onClick: () => void;
}) {
  const startAt = toDate(event.startAt);
  const status = eventStatus(event);
  const whenLabel = startAt
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(startAt)
    : "—";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-wrap items-start gap-3 rounded-xl border bg-card p-4 text-left transition hover:bg-muted/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">
              {contact?.name || contact?.email || "Anonymous"}
            </span>
            <StatusPill status={status} />
            {event.paymentRequired &&
              event.paymentAmount != null &&
              event.paymentCurrency && (
                <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:text-zinc-400">
                  {event.paymentCurrency} {event.paymentAmount}
                </span>
              )}
          </div>
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {whenLabel}
          </p>
          {contact && (contact.email || contact.phone) && (
            <p className="inline-flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              {contact.email && (
                <span className="inline-flex items-center gap-0.5">
                  <Mail className="h-3 w-3" />
                  {contact.email}
                </span>
              )}
              {contact.phone && (
                <span className="inline-flex items-center gap-0.5">
                  <User className="h-3 w-3" />
                  {contact.phone}
                </span>
              )}
            </p>
          )}
        </div>
        <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

function StatusPill({ status }: { status: EventStatus }) {
  if (status === "awaiting_payment") {
    return (
      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
        Awaiting payment
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">
        Cancelled
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
        Completed
      </span>
    );
  }
  if (status === "no_show") {
    return (
      <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:text-zinc-400">
        No-show
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
      Confirmed
    </span>
  );
}
