"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import type { EventStatus } from "@/types/events";

/**
 * Public-facing event-management surface. Shows the attendee a summary
 * of their booking and lets them reschedule + cancel without logging
 * in. Inline reschedule shows the booking page's live availability
 * (excluding the current slot — they see their own time as available).
 */

type SlotISO = { startAt: string; endAt: string };

interface Branding {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
}

interface Props {
  token: string;
  subAccountId: string;
  eventId: string;
  status: EventStatus;
  title: string;
  pageName: string;
  pageSlug: string;
  bookingPageStatus: "draft" | "published";
  timezone: string;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  paymentLinkUrl: string | null;
  paymentAmount: number | null;
  paymentCurrency: string | null;
  branding: Branding;
}

function detectBrowserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatLong(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function isoDayKeyInTz(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function PublicEventView(props: Props) {
  const [viewerTz, setViewerTz] = useState(props.timezone);
  const [status, setStatus] = useState<EventStatus>(props.status);
  const [currentStart, setCurrentStart] = useState(props.startAt);
  const [currentEnd, setCurrentEnd] = useState(props.endAt);
  const [mode, setMode] = useState<"view" | "reschedule" | "cancel">("view");
  const [slots, setSlots] = useState<SlotISO[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotISO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    const tz = detectBrowserTz();
    if (tz !== props.timezone) setViewerTz(tz);
  }, [props.timezone]);

  const accent = props.branding.accentColor;
  const accentStyle: React.CSSProperties = accent
    ? { backgroundColor: accent, borderColor: accent }
    : {};
  const isTerminal =
    status === "cancelled" ||
    status === "completed" ||
    status === "no_show";
  const isPast = new Date(currentEnd).getTime() < Date.now();

  // Load availability when entering reschedule mode. Excludes the
  // current slot from the busy list server-side via the `excludeEventId`
  // query param so the visitor sees their own slot as available.
  useEffect(() => {
    if (mode !== "reschedule") return;
    if (props.bookingPageStatus !== "published") {
      setError(
        "This booking page is no longer accepting new times. Please cancel and re-book later.",
      );
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setError(null);
    fetch(
      `/api/booking/${props.subAccountId}/${props.pageSlug}/availability?excludeEventId=${encodeURIComponent(props.eventId)}`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "Couldn't load times.");
        }
        const data = (await res.json()) as { slots: SlotISO[] };
        if (cancelled) return;
        setSlots(data.slots);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Load failed.");
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, props.subAccountId, props.pageSlug, props.eventId, props.bookingPageStatus]);

  const slotsByDay = useMemo(() => {
    const groups = new Map<string, SlotISO[]>();
    for (const s of slots) {
      const key = isoDayKeyInTz(s.startAt, viewerTz);
      const bucket = groups.get(key);
      if (bucket) bucket.push(s);
      else groups.set(key, [s]);
    }
    return [...groups.entries()]
      .map(([dateKey, list]) => ({ dateKey, slots: list }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [slots, viewerTz]);

  async function handleCancel() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${props.token}/cancel`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't cancel.");
      }
      setStatus("cancelled");
      setMode("view");
      setDoneMessage("This booking has been cancelled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReschedule() {
    if (!selectedSlot) {
      setError("Pick a new time first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${props.token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: selectedSlot }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        newStartAt?: string;
        newEndAt?: string;
        newToken?: string;
      };
      if (!res.ok || !data.ok || !data.newStartAt || !data.newEndAt) {
        throw new Error(data.error ?? "Couldn't reschedule.");
      }
      setCurrentStart(data.newStartAt);
      setCurrentEnd(data.newEndAt);
      setSelectedSlot(null);
      setSlots([]);
      setMode("view");
      setDoneMessage("Rescheduled. We've emailed an updated confirmation.");
      // Token rotates on reschedule — replace the URL in-place so a
      // subsequent reschedule/cancel from this tab uses the new token.
      if (data.newToken && typeof window !== "undefined") {
        window.history.replaceState(null, "", `/e/${data.newToken}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reschedule failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10 text-foreground sm:py-16">
      <article className="mx-auto max-w-2xl space-y-6 rounded-3xl border bg-card p-6 shadow-sm sm:p-10">
        <header className="space-y-3 text-center">
          {props.branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.branding.logoUrl}
              alt={props.branding.name}
              className="mx-auto h-12 w-auto rounded-md object-contain"
            />
          ) : (
            <span
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-white"
              style={{ backgroundColor: accent ?? "#0F766E" }}
            >
              <CalendarClock className="h-6 w-6" />
            </span>
          )}
          <h1 className="text-2xl font-bold tracking-tight">
            {props.pageName}
          </h1>
          <StatusBadge status={status} isPast={isPast} />
        </header>

        <section className="rounded-2xl border bg-muted/30 p-4 text-center text-sm">
          <p className="font-medium">
            {formatLong(currentStart, viewerTz)}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {props.durationMinutes} minutes
          </p>
        </section>

        {doneMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{doneMessage}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-400">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {status === "awaiting_payment" && props.paymentLinkUrl && (
          <section className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-center text-sm text-amber-700 dark:text-amber-400">
            <p className="font-medium">Awaiting payment</p>
            <p className="text-xs">
              Pay to confirm — we&apos;ll send a confirmation once the
              payment lands.
            </p>
            <a
              href={props.paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border bg-foreground px-5 text-sm font-medium text-background"
              style={accentStyle.backgroundColor ? accentStyle : undefined}
            >
              Pay {props.paymentCurrency} {props.paymentAmount} on PayPal
            </a>
          </section>
        )}

        {!isTerminal && !isPast && mode === "view" && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setMode("reschedule")}
              className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
            >
              Reschedule
            </button>
            <button
              type="button"
              onClick={() => setMode("cancel")}
              className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium text-destructive hover:bg-destructive/5"
            >
              Cancel booking
            </button>
          </div>
        )}

        {mode === "reschedule" && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Pick a new time</h2>
              <button
                type="button"
                onClick={() => {
                  setMode("view");
                  setSelectedSlot(null);
                  setError(null);
                }}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Back
              </button>
            </div>
            {slotsLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : slotsByDay.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                No other times currently available.
              </div>
            ) : (
              <div className="space-y-3">
                {slotsByDay.map((d) => (
                  <div key={d.dateKey} className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {formatDate(`${d.dateKey}T12:00:00Z`, viewerTz)}
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {d.slots.map((s) => {
                        const isSelected =
                          selectedSlot?.startAt === s.startAt;
                        return (
                          <button
                            key={s.startAt}
                            type="button"
                            onClick={() => setSelectedSlot(s)}
                            className={`rounded-lg border px-2 py-2 text-sm font-medium ${
                              isSelected
                                ? "text-white"
                                : "border-input bg-background hover:bg-muted"
                            }`}
                            style={isSelected ? accentStyle : undefined}
                          >
                            {formatTime(s.startAt, viewerTz)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleReschedule}
                disabled={!selectedSlot || submitting}
                className="inline-flex h-10 items-center justify-center rounded-lg border bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50"
                style={
                  accentStyle.backgroundColor && selectedSlot
                    ? accentStyle
                    : undefined
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Rescheduling…
                  </>
                ) : (
                  "Confirm new time"
                )}
              </button>
            </div>
          </section>
        )}

        {mode === "cancel" && (
          <section className="space-y-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 text-sm text-rose-700 dark:text-rose-400">
            <p className="font-medium">Cancel this booking?</p>
            <p className="text-xs">
              The slot is released immediately. You can re-book later if
              your plans change.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                className="inline-flex h-10 items-center justify-center rounded-lg border bg-destructive/10 px-4 text-sm font-medium text-destructive disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Cancelling…
                  </>
                ) : (
                  "Yes, cancel"
                )}
              </button>
              <button
                type="button"
                onClick={() => setMode("view")}
                className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium"
              >
                Keep it
              </button>
            </div>
          </section>
        )}

        <footer className="border-t pt-4 text-center text-[11px] text-muted-foreground">
          Powered by {props.branding.name}
        </footer>
      </article>
    </main>
  );
}

function StatusBadge({
  status,
  isPast,
}: {
  status: EventStatus;
  isPast: boolean;
}) {
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">
        Cancelled
      </span>
    );
  }
  if (status === "awaiting_payment") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        Awaiting payment
      </span>
    );
  }
  if (status === "completed" || isPast) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-400">
        Past
      </span>
    );
  }
  if (status === "no_show") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-400">
        No-show
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      Confirmed
    </span>
  );
}
