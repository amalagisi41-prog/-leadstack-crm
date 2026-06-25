"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  Copy,
  CopyPlus,
  ExternalLink,
  HelpCircle,
  Loader2,
  Lock,
  Pencil,
  Plus,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToBookingPages } from "@/lib/firestore/booking-pages";
import { Button } from "@/components/ui/button";
import { BookingHelpDialog } from "@/components/booking/booking-help-dialog";
import type { BookingPage } from "@/types/booking";

/**
 * Per-sub-account list of booking pages. Empty state is the onboarding
 * surface ("create your first booking page" → guides them to the editor).
 *
 * Auth: any active member can READ; only sub-account admins (+ agency
 * owners) can CREATE. Non-admin collaborators see the list + share
 * links but the "New" button is replaced by a locked hint.
 */
export default function BookingListPage() {
  const router = useRouter();
  const { subAccountId, saPath, isAdmin } = useSubAccount();
  const [pages, setPages] = useState<BookingPage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [duplicatingSlug, setDuplicatingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!subAccountId) return;
    const unsub = subscribeToBookingPages(
      subAccountId,
      (list) => {
        setPages(list);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return () => unsub();
  }, [subAccountId]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  function publicLinkFor(slug: string): string {
    return `${appUrl.replace(/\/$/, "")}/b/${subAccountId}/${slug}`;
  }

  function copyLink(slug: string) {
    void navigator.clipboard.writeText(publicLinkFor(slug));
    toast.success("Public link copied.");
  }

  async function duplicatePage(slug: string) {
    if (duplicatingSlug) return;
    setDuplicatingSlug(slug);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/booking-pages/${slug}/duplicate`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        slug?: string;
        warning?: string | null;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.slug) {
        toast.error(body.error ?? "Couldn't duplicate the booking page.");
        return;
      }
      toast.success("Booking page duplicated — now editing the copy.");
      if (body.warning) toast.warning(body.warning);
      // Land in the new draft's editor so the operator can rename + publish.
      router.push(saPath(`/booking/${body.slug}`));
    } catch {
      toast.error("Couldn't duplicate the booking page. Please try again.");
    } finally {
      setDuplicatingSlug(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Booking</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Public booking pages your leads can use to grab a slot. Share
            the link in emails, on your site, or in the
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">
              {"{{bookingLink}}"}
            </code>
            template merge tag.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle className="mr-1 h-3.5 w-3.5" />
            How it works
          </Button>
          {isAdmin ? (
            <Button render={<Link href={saPath("/booking/new")} />}>
              <Plus className="mr-1 h-4 w-4" />
              New booking page
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Admin-only
            </div>
          )}
        </div>
      </header>

      <BookingHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {!loaded ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="ml-auto h-4 w-4 animate-spin" />
          <span>Loading…</span>
          <span className="mr-auto" />
        </div>
      ) : pages.length === 0 ? (
        <EmptyState isAdmin={isAdmin} newHref={saPath("/booking/new")} />
      ) : (
        <ul className="space-y-2.5">
          {pages.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-start gap-3 rounded-2xl border bg-card p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={saPath(`/booking/${p.slug}`)}
                    className="font-semibold hover:underline"
                  >
                    {p.name}
                  </Link>
                  <StatusPill status={p.status} />
                  {p.payment && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                      Deposit {p.payment.currency} {p.payment.amount}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {p.durationMinutes}-min slots · {p.timezone}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {publicLinkFor(p.slug)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {isAdmin && (
                  <Button
                    render={<Link href={saPath(`/booking/${p.slug}`)} />}
                    variant="outline"
                    size="sm"
                    title="Edit booking page"
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => duplicatePage(p.slug)}
                    disabled={duplicatingSlug !== null}
                    title="Duplicate this page as a new draft"
                  >
                    {duplicatingSlug === p.slug ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CopyPlus className="mr-1 h-3.5 w-3.5" />
                    )}
                    Duplicate
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyLink(p.slug)}
                  disabled={p.status !== "published"}
                  title={
                    p.status === "published"
                      ? "Copy public link"
                      : "Publish the page to share its link"
                  }
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy
                </Button>
                {p.status === "published" && (
                  <Button
                    render={
                      <a
                        href={publicLinkFor(p.slug)}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    variant="outline"
                    size="sm"
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    Open
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: BookingPage["status"] }) {
  return status === "published" ? (
    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
      Published
    </span>
  ) : (
    <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:text-zinc-400">
      Draft
    </span>
  );
}

function EmptyState({
  isAdmin,
  newHref,
}: {
  isAdmin: boolean;
  newHref: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400">
        <CalendarClock className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold">
        Replace Calendly. Create your first booking page.
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick working hours, slot length, and a confirmation message —
        share the link and your leads grab a time. Reminders + reschedule
        / cancel are built in.
      </p>
      {isAdmin && (
        <Button render={<Link href={newHref} />} className="mt-5">
          <Plus className="mr-1 h-4 w-4" />
          New booking page
        </Button>
      )}
    </div>
  );
}
