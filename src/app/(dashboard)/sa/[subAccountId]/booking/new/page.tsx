"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { BookingPageEditor } from "@/components/booking/booking-page-editor";

/**
 * Create a new booking page. Editor is hydrated with sensible defaults
 * (Mon-Fri 9-5, 30-min slots, the operator's detected browser
 * timezone). Admin-only — non-admins land here via the "New" button on
 * the list page, which is hidden for collaborators; but defense-in-depth
 * matters, so we render a locked message rather than relying on UI gating.
 */
export default function NewBookingPagePage() {
  const { saPath, isAdmin } = useSubAccount();

  return (
    <div className="space-y-6">
      <Link
        href={saPath("/booking")}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to booking pages
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          New booking page
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create the public URL leads will use to grab a slot. Save as a
          draft first — publish when you&apos;re ready to share.
        </p>
      </header>

      {!isAdmin ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-700 dark:text-amber-400">
          Booking pages are sub-account admin only. Ask an admin to create
          one for you.
        </div>
      ) : (
        <BookingPageEditor mode="new" />
      )}
    </div>
  );
}
