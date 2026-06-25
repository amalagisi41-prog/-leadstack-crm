"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  ListChecks,
  Loader2,
  Lock,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToBookingPage,
  subscribeToBookingPageEvents,
} from "@/lib/firestore/booking-pages";
import { Button } from "@/components/ui/button";
import { BookingPageEditor } from "@/components/booking/booking-page-editor";
import { toDate } from "@/lib/format";
import { eventStatus } from "@/types/events";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent } from "@/types/events";

/**
 * Edit an existing booking page. Header shows the current status, the
 * public link (when published), and admin actions. The editor body
 * mounts the same component used by /new — same form, hydrated from the
 * live doc via onSnapshot so a teammate's edit reflects live.
 */
export default function EditBookingPagePage() {
  const params = useParams<{ subAccountId: string; slug: string }>();
  const slug = params.slug;
  const { subAccountId, saPath, isAdmin } = useSubAccount();
  const [page, setPage] = useState<BookingPage | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!subAccountId || !slug) return;
    const unsubPage = subscribeToBookingPage(
      subAccountId,
      slug,
      (next) => {
        setPage(next);
        setLoaded(true);
        if (!next) setMissing(true);
      },
      () => setLoaded(true),
    );
    const unsubEvents = subscribeToBookingPageEvents(
      subAccountId,
      slug,
      setEvents,
    );
    return () => {
      unsubPage();
      unsubEvents();
    };
  }, [subAccountId, slug]);

  const stats = (() => {
    const now = Date.now();
    let upcoming = 0;
    let awaiting = 0;
    for (const e of events) {
      const status = eventStatus(e);
      const startMs = toDate(e.startAt)?.getTime() ?? 0;
      if (status === "scheduled" && startMs >= now) upcoming++;
      if (status === "awaiting_payment") awaiting++;
    }
    return { total: events.length, upcoming, awaiting };
  })();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicLink = page
    ? `${appUrl.replace(/\/$/, "")}/b/${subAccountId}/${page.slug}`
    : "";

  function copyLink() {
    if (!publicLink) return;
    void navigator.clipboard.writeText(publicLink);
    toast.success("Public link copied.");
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
        <Loader2 className="ml-auto h-4 w-4 animate-spin" />
        <span>Loading…</span>
        <span className="mr-auto" />
      </div>
    );
  }

  if (missing || !page) {
    return (
      <div className="space-y-4">
        <Link
          href={saPath("/booking")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to booking pages
        </Link>
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Booking page not found — it may have been deleted.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={saPath("/booking")}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to booking pages
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{page.name}</h1>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {publicLink}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyLink}
            disabled={page.status !== "published"}
            title={
              page.status === "published"
                ? "Copy public link"
                : "Publish the page to share its link"
            }
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            Copy link
          </Button>
          {page.status === "published" && (
            <Button
              render={
                <a href={publicLink} target="_blank" rel="noreferrer" />
              }
              variant="outline"
              size="sm"
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Open
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total bookings" value={stats.total} />
        <StatCard label="Upcoming" value={stats.upcoming} />
        <StatCard
          label="Awaiting payment"
          value={stats.awaiting}
          tone={stats.awaiting > 0 ? "amber" : "default"}
        />
      </div>

      <div>
        <Button
          render={<Link href={saPath(`/booking/${slug}/bookings`)} />}
          variant="outline"
          size="sm"
        >
          <ListChecks className="mr-1 h-3.5 w-3.5" />
          View bookings ({stats.total})
        </Button>
      </div>

      {!isAdmin ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-2xl border bg-muted/40 p-5 text-sm">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Admin-only editor</p>
              <p className="mt-1 text-muted-foreground">
                You can view + share the link, but only sub-account admins
                can edit page settings.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <BookingPageEditor mode="edit" initial={page} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "amber";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "amber" && value > 0
          ? "border-amber-500/30 bg-amber-500/5"
          : "bg-card"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          tone === "amber" && value > 0
            ? "text-amber-700 dark:text-amber-400"
            : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
