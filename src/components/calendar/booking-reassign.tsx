"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { doc, getDoc } from "firebase/firestore";
import { Loader2, Users } from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { eventSource, type CalendarEvent } from "@/types/events";
import type { BookingHost, BookingPage } from "@/types/booking";

/**
 * Reassign-host control for a team booking. Renders inside the booking event
 * panel — only for booking-page events whose page has hosts, and only for a
 * sub-account admin or the booking's current host. Posts to
 * /api/events/by-id/[id]/assign (which re-validates permission + the host).
 * Returns null when reassignment doesn't apply, so the caller can drop it in
 * unconditionally.
 */
export function BookingReassign({ event }: { event: CalendarEvent }) {
  const { user } = useAuth();
  const { isAdmin } = useSubAccount();
  const [hosts, setHosts] = useState<BookingHost[]>([]);
  const [busy, setBusy] = useState(false);

  const isBookingPage = eventSource(event) === "booking_page";
  const { subAccountId, bookingPageSlug } = event;

  useEffect(() => {
    if (!isBookingPage || !bookingPageSlug) {
      setHosts([]);
      return;
    }
    let cancelled = false;
    getDoc(
      doc(
        getFirebaseDb(),
        `subAccounts/${subAccountId}/bookingPages/${bookingPageSlug}`,
      ),
    )
      .then((snap) => {
        if (cancelled) return;
        const data = snap.data() as BookingPage | undefined;
        setHosts(data?.hosts ?? []);
      })
      .catch(() => {
        if (!cancelled) setHosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isBookingPage, subAccountId, bookingPageSlug]);

  // Team mode only; and only an admin or the current host may reassign.
  const canReassign =
    hosts.length > 0 &&
    (isAdmin || (!!event.assignedToUid && event.assignedToUid === user?.uid));
  if (!canReassign) return null;

  async function reassign(toUid: string, force = false) {
    if (!toUid || toUid === (event.assignedToUid ?? "")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/events/by-id/${event.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToUid: toUid, force }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        needsConfirm?: boolean;
        warning?: string;
      };
      // Soft conflict — confirm, then retry with force.
      if (res.ok && data.needsConfirm && !force) {
        if (
          confirm(
            `${data.warning ?? "This host may have a conflict."}\n\nReassign anyway?`,
          )
        ) {
          await reassign(toUid, true);
        }
        return;
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't reassign.");
      }
      toast.success("Booking reassigned.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  // If the current assignee was removed from the page's host list after the
  // booking, still surface them as an option so the <select> value matches.
  const assigneeMissing =
    !!event.assignedToUid && !hosts.some((h) => h.uid === event.assignedToUid);

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Assigned host
      </p>
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <label htmlFor={`reassign-${event.id}`} className="sr-only">
          Reassign host
        </label>
        <select
          id={`reassign-${event.id}`}
          value={event.assignedToUid ?? ""}
          disabled={busy}
          onChange={(e) => reassign(e.target.value)}
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 [&_option]:bg-background [&_option]:text-foreground"
        >
          {assigneeMissing && (
            <option value={event.assignedToUid ?? ""}>
              {event.assignedToName ?? "Current host"}
            </option>
          )}
          {hosts.map((h) => (
            <option key={h.uid} value={h.uid}>
              {h.name}
            </option>
          ))}
        </select>
        {busy && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
