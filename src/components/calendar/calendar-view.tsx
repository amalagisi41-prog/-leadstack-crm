"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EventDialog } from "@/components/calendar/event-dialog";
import type { CalendarEvent } from "@/types/events";
import type { Contact } from "@/types/contacts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CalendarViewProps {
  events: CalendarEvent[];
  contacts: Contact[];
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfGrid(monthStart: Date): Date {
  const d = new Date(monthStart);
  const weekday = (d.getDay() + 6) % 7; // Monday-first: 0 = Mon
  d.setDate(d.getDate() - weekday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTime(d: Date): string {
  return d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: d.getMinutes() === 0 ? undefined : "2-digit",
    })
    .toLowerCase()
    .replace(" ", "");
}

export function CalendarView({ events, contacts }: CalendarViewProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);

  const monthLabel = cursor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const gridStart = useMemo(() => startOfGrid(cursor), [cursor]);
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [gridStart]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const start = toDate(ev.startAt);
      if (!start) continue;
      const key = dayKey(start);
      const bucket = map.get(key);
      if (bucket) bucket.push(ev);
      else map.set(key, [ev]);
    }
    for (const bucket of map.values()) {
      bucket.sort(
        (a, b) => (toDate(a.startAt)?.getTime() ?? 0) - (toDate(b.startAt)?.getTime() ?? 0),
      );
    }
    return map;
  }, [events]);

  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  function shiftMonth(delta: number) {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + delta);
    setCursor(d);
  }

  function goToday() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    setCursor(d);
  }

  function openNew(day?: Date) {
    setEditEvent(null);
    setDefaultDate(day ?? new Date());
    setDialogOpen(true);
  }

  function openEdit(ev: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation();
    setEditEvent(ev);
    setDefaultDate(null);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="rounded-2xl border bg-card">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {monthLabel}
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {events.length} events
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => openNew()} className="ml-2">
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Event
            </Button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b bg-muted/20">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-7 grid-rows-6">
          {days.map((d, i) => {
            const isCurrentMonth = d.getMonth() === cursor.getMonth();
            const isToday = d.getTime() === today.getTime();
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const dayEvents = eventsByDay.get(dayKey(d)) ?? [];
            const visible = dayEvents.slice(0, 3);
            const overflow = dayEvents.length - visible.length;
            const colIndex = i % 7;
            const rowIndex = Math.floor(i / 7);

            return (
              <div
                key={dayKey(d)}
                onClick={() => openNew(d)}
                className={cn(
                  "group relative min-h-[100px] cursor-pointer p-1.5 transition-colors hover:bg-muted/30",
                  colIndex < 6 && "border-r",
                  rowIndex < 5 && "border-b",
                  !isCurrentMonth && "bg-muted/10",
                  isWeekend && isCurrentMonth && "bg-muted/5",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                      isToday &&
                        "bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-sm",
                      !isToday && isCurrentMonth && "text-foreground",
                      !isToday && !isCurrentMonth && "text-muted-foreground/50",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openNew(d);
                    }}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Add event"
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                  </button>
                </div>

                <div className="space-y-1">
                  {visible.map((ev) => {
                    const start = toDate(ev.startAt);
                    const contact = ev.contactId
                      ? contactById.get(ev.contactId)
                      : null;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => openEdit(ev, e)}
                        className="group/event flex w-full items-center gap-1 truncate rounded-md border border-transparent bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-pink-500/10 px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition-colors hover:border-primary/30"
                      >
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500" />
                        {start && (
                          <span className="shrink-0 text-muted-foreground">
                            {formatTime(start)}
                          </span>
                        )}
                        <span className="truncate">
                          {ev.title}
                          {contact && (
                            <span className="text-muted-foreground">
                              {" · "}
                              {contact.name?.split(" ")[0] ?? ""}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  {overflow > 0 && (
                    <span className="px-1 text-[10px] text-muted-foreground">
                      +{overflow} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contacts={contacts}
        event={editEvent}
        defaultDate={defaultDate}
      />
    </>
  );
}
