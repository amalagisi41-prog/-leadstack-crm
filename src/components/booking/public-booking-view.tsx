"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import type { BookingPage, IntakeField } from "@/types/booking";

/**
 * Visitor-facing booking surface. Self-contained client component:
 * fetches availability, lets the visitor pick a day + time, collects
 * intake fields, and posts to the book endpoint.
 *
 * Slice 3 ships the picker + intake form; the submit currently shows a
 * "wired up next" placeholder. Slice 4 hooks it up to
 * POST /api/booking/[saId]/[slug]/book.
 *
 * Times are computed server-side in the page's timezone but RENDERED in
 * the visitor's browser timezone (detected at mount). A small dropdown
 * lets the visitor switch back to the page's tz if they prefer.
 */

type SlotISO = { startAt: string; endAt: string };

interface Branding {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
}

interface Props {
  subAccountId: string;
  page: Omit<BookingPage, "createdAt" | "updatedAt"> & {
    createdAt: null;
    updatedAt: null;
  };
  branding: Branding;
}

function detectBrowserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function isoDayKeyInTz(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatTimeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDateHeadingInTz(dayKey: string, tz: string): string {
  // dayKey is "YYYY-MM-DD" in `tz`. Build a noon-in-tz Date for
  // formatting so the day rendered matches the bucket.
  const [y, m, d] = dayKey.split("-").map(Number);
  // Anchor at 12:00 UTC of the date — within rounding of correct tz day.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(anchor);
}

export function PublicBookingView({ subAccountId, page, branding }: Props) {
  const pageTz = page.timezone;
  const [viewerTz, setViewerTz] = useState(pageTz);
  const [slots, setSlots] = useState<SlotISO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotISO | null>(null);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    status: "scheduled" | "awaiting_payment";
    paymentUrl: string | null;
    confirmationMessage: string | null;
    redirectUrl: string | null;
  } | null>(null);

  // Detect the visitor's timezone after hydration. The server renders
  // with `pageTz` so the markup is stable across hydration; the swap
  // happens on the client only.
  useEffect(() => {
    const detected = detectBrowserTz();
    if (detected !== pageTz) setViewerTz(detected);
  }, [pageTz]);

  // Fetch availability on mount. No date params — `computeAvailability`
  // already defaults to "now → now + page.visibleDays".
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/booking/${subAccountId}/${page.slug}/availability`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "Couldn't load availability.");
        }
        const data = (await res.json()) as { slots: SlotISO[] };
        if (cancelled) return;
        setSlots(data.slots);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Load failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId, page.slug]);

  // Bucket slots by day in the viewer's tz. Re-derives when viewerTz
  // changes — the same UTC instant can sit on different calendar days
  // for visitors in different zones.
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

  // First load: open the first day with slots.
  useEffect(() => {
    if (activeDay !== null) return;
    if (slotsByDay.length === 0) return;
    setActiveDay(slotsByDay[0].dateKey);
  }, [slotsByDay, activeDay]);

  const activeDaySlots = useMemo(
    () => slotsByDay.find((d) => d.dateKey === activeDay)?.slots ?? [],
    [slotsByDay, activeDay],
  );

  function advanceDay(dir: 1 | -1) {
    if (!activeDay) return;
    const idx = slotsByDay.findIndex((d) => d.dateKey === activeDay);
    const next = idx + dir;
    if (next < 0 || next >= slotsByDay.length) return;
    setActiveDay(slotsByDay[next].dateKey);
    setSelectedSlot(null);
  }

  // Accent style — applied to primary buttons + selected slot ring.
  const accent = branding.accentColor;
  const accentStyle: React.CSSProperties = accent
    ? { backgroundColor: accent, borderColor: accent }
    : {};

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10 text-foreground sm:py-16">
      <article className="mx-auto max-w-3xl space-y-8 rounded-3xl border bg-card p-6 shadow-sm sm:p-10">
        {/* ── Hero ──────────────────────────────────────────── */}
        <header className="space-y-3 text-center">
          {branding.logoUrl ? (
            // Decorative; alt is the business name.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.name}
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
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {page.name}
          </h1>
          {page.description && (
            <p className="mx-auto max-w-prose whitespace-pre-wrap text-sm text-muted-foreground">
              {page.description}
            </p>
          )}
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {page.durationMinutes} minutes
            {page.payment && (
              <>
                <span className="mx-1">·</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  {page.payment.currency} {page.payment.amount} deposit
                </span>
              </>
            )}
          </p>
        </header>

        {/* ── Timezone switcher ────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>Times shown in</span>
          <select
            value={viewerTz}
            onChange={(e) => {
              setViewerTz(e.target.value);
              setActiveDay(null);
              setSelectedSlot(null);
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value={viewerTz}>{viewerTz}</option>
            {pageTz !== viewerTz && <option value={pageTz}>{pageTz}</option>}
          </select>
        </div>

        {/* ── Slot picker ──────────────────────────────────── */}
        <section className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading available
              times…
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 text-sm text-rose-700 dark:text-rose-400">
              {loadError}
            </div>
          ) : slotsByDay.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
              No times available in the next {page.visibleDays} days. Try
              again soon.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => advanceDay(-1)}
                  disabled={
                    !activeDay ||
                    slotsByDay[0]?.dateKey === activeDay
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-input bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-semibold">
                  {activeDay
                    ? formatDateHeadingInTz(activeDay, viewerTz)
                    : ""}
                </h2>
                <button
                  type="button"
                  onClick={() => advanceDay(1)}
                  disabled={
                    !activeDay ||
                    slotsByDay[slotsByDay.length - 1]?.dateKey === activeDay
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-input bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                  aria-label="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {activeDaySlots.map((s) => {
                  const isSelected =
                    selectedSlot?.startAt === s.startAt;
                  return (
                    <button
                      key={s.startAt}
                      type="button"
                      onClick={() => setSelectedSlot(s)}
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                        isSelected
                          ? "text-white shadow-sm"
                          : "border-input bg-background hover:bg-muted hover:text-foreground"
                      }`}
                      style={isSelected ? accentStyle : undefined}
                    >
                      {formatTimeInTz(s.startAt, viewerTz)}
                    </button>
                  );
                })}
              </div>

              {/* Day strip — small dots so the visitor knows other days
                  carry slots too. */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                {slotsByDay.map((d) => (
                  <button
                    key={d.dateKey}
                    type="button"
                    onClick={() => {
                      setActiveDay(d.dateKey);
                      setSelectedSlot(null);
                    }}
                    className={`rounded-full border px-3 py-1 text-[11px] transition ${
                      d.dateKey === activeDay
                        ? "border-foreground/40 bg-muted text-foreground"
                        : "border-input bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {formatDateHeadingInTz(d.dateKey, viewerTz)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Intake form (revealed after slot pick) ────────── */}
        {selectedSlot && !confirmation && (
          <IntakeFormSection
            subAccountId={subAccountId}
            slug={page.slug}
            slot={selectedSlot}
            viewerTz={viewerTz}
            page={page}
            accentStyle={accentStyle}
            onConfirmed={(c) => setConfirmation(c)}
          />
        )}

        {confirmation && (
          <ConfirmationPanel
            confirmation={confirmation}
            page={page}
          />
        )}

        <footer className="border-t pt-4 text-center text-[11px] text-muted-foreground">
          Powered by {branding.name}
        </footer>
      </article>
    </main>
  );
}

function IntakeFormSection({
  subAccountId,
  slug,
  slot,
  viewerTz,
  page,
  accentStyle,
  onConfirmed,
}: {
  subAccountId: string;
  slug: string;
  slot: SlotISO;
  viewerTz: string;
  page: Props["page"];
  accentStyle: React.CSSProperties;
  onConfirmed: (next: {
    status: "scheduled" | "awaiting_payment";
    paymentUrl: string | null;
    confirmationMessage: string | null;
    redirectUrl: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setExtra(id: string, value: string) {
    setExtras((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError("Name, email, and phone are required.");
      return;
    }
    for (const f of page.intakeFields) {
      if (f.required && !(extras[f.id] ?? "").trim()) {
        setError(`Please answer: ${f.label}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/booking/${subAccountId}/${slug}/book`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slot,
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            extras,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        status?: "scheduled" | "awaiting_payment";
        paymentUrl?: string | null;
        confirmationMessage?: string | null;
        redirectUrl?: string | null;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Booking failed. Please try again.");
      }
      onConfirmed({
        status: data.status ?? "scheduled",
        paymentUrl: data.paymentUrl ?? null,
        confirmationMessage: data.confirmationMessage ?? null,
        redirectUrl: data.redirectUrl ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border bg-muted/30 p-3 text-center text-sm">
        <span className="font-medium">
          {new Intl.DateTimeFormat(undefined, {
            timeZone: viewerTz,
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(slot.startAt))}
        </span>
        <span className="text-muted-foreground"> · {page.durationMinutes} min</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="b-name" required>
          <input
            id="b-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            maxLength={120}
            required
          />
        </Field>
        <Field label="Email" htmlFor="b-email" required>
          <input
            id="b-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            maxLength={200}
            required
          />
        </Field>
        <Field label="Phone" htmlFor="b-phone" required className="sm:col-span-2">
          <input
            id="b-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            maxLength={40}
            required
          />
        </Field>
      </div>

      {page.intakeFields.length > 0 && (
        <div className="space-y-3">
          {page.intakeFields.map((f) => (
            <ExtraField
              key={f.id}
              field={f}
              value={extras[f.id] ?? ""}
              onChange={(v) => setExtra(f.id, v)}
            />
          ))}
        </div>
      )}

      {page.payment && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            A {page.payment.currency} {page.payment.amount}
            {page.payment.description ? ` ${page.payment.description.toLowerCase()}` : ""}{" "}
            is required to confirm this booking. You&apos;ll see the PayPal
            link on the next screen.
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-xs text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-10 w-full items-center justify-center rounded-lg border bg-foreground px-3 text-sm font-medium text-background transition disabled:opacity-60"
        style={accentStyle.backgroundColor ? accentStyle : undefined}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            Booking…
          </>
        ) : page.payment ? (
          "Continue to payment"
        ) : (
          "Confirm booking"
        )}
      </button>
    </form>
  );
}

// Seconds the confirmation panel stays visible before an auto-redirect
// fires — long enough for the booking to visibly succeed + any pixel on
// this page to fire, short enough to feel like a hand-off.
const REDIRECT_COUNTDOWN_SECONDS = 3;

function ConfirmationPanel({
  confirmation,
  page,
}: {
  confirmation: {
    status: "scheduled" | "awaiting_payment";
    paymentUrl: string | null;
    confirmationMessage: string | null;
    redirectUrl: string | null;
  };
  page: Props["page"];
}) {
  const pending = confirmation.status === "awaiting_payment";

  // Auto-redirect only for confirmed (non-pending) bookings carrying a
  // redirect URL. Pending/paid holds never redirect (defense-in-depth on
  // top of the server already nulling redirectUrl for them) so the
  // PayPal CTA stays put.
  const willRedirect = !pending && !!confirmation.redirectUrl;
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!willRedirect || !confirmation.redirectUrl) return;
    const target = confirmation.redirectUrl;
    const tick = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    const go = setTimeout(() => {
      // replace() so the back button returns to the booker's origin, not
      // the just-submitted confirmation screen.
      window.location.replace(target);
    }, REDIRECT_COUNTDOWN_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [willRedirect, confirmation.redirectUrl]);

  return (
    <section
      className={`space-y-3 rounded-2xl border p-5 text-center text-sm ${
        pending
          ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400"
          : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      }`}
    >
      <CheckCircle2 className="mx-auto h-6 w-6" />
      <p className="font-medium">
        {pending ? "Almost there — pay to confirm" : "You're booked."}
      </p>
      {confirmation.confirmationMessage && !pending && (
        <p className="whitespace-pre-wrap text-xs">
          {confirmation.confirmationMessage}
        </p>
      )}
      {pending && (
        <p className="text-xs">
          Your slot is held. Pay the deposit below to lock it in. We&apos;ll
          email a confirmation as soon as we see the payment. If you
          don&apos;t pay within {page.payment?.holdHours ?? 24} hours the
          slot is released automatically.
        </p>
      )}
      {pending && confirmation.paymentUrl && (
        <a
          href={confirmation.paymentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-lg border bg-foreground px-5 text-sm font-medium text-background transition"
        >
          Pay {page.payment?.currency} {page.payment?.amount} on PayPal
        </a>
      )}
      <p className="text-xs">
        We&apos;ve also emailed you with all the details.
      </p>
      {willRedirect && confirmation.redirectUrl && (
        <p className="text-xs">
          Redirecting you in {secondsLeft}s…{" "}
          <a
            href={confirmation.redirectUrl}
            className="underline underline-offset-2"
          >
            Go now
          </a>
        </p>
      )}
    </section>
  );
}

function ExtraField({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: string;
  onChange: (next: string) => void;
}) {
  const id = `b-q-${field.id}`;
  return (
    <Field label={field.label} htmlFor={id} required={field.required}>
      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={2000}
          required={field.required}
          className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            Pick one…
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
          required={field.required}
          className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      )}
    </Field>
  );
}

function Field({
  label,
  htmlFor,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
