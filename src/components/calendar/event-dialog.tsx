"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import {
  Trash2,
  MapPin,
  StickyNote,
  CalendarClock,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  User,
  UserX,
  Video,
  XCircle,
  Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContactPicker } from "@/components/quotes/contact-picker";
import { useSubAccount } from "@/context/sub-account-context";
import { updateEvent, deleteEvent } from "@/lib/firestore/events";
import { BookingReassign } from "@/components/calendar/booking-reassign";
import { toDate } from "@/lib/format";
import {
  eventSource,
  eventStatus,
  type CalendarEvent,
  type EventFormData,
  type EventStatus,
} from "@/types/events";
import type { Contact } from "@/types/contacts";

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  event?: CalendarEvent | null;
  defaultDate?: Date | null;
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function fromInputs(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function roundedNowHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function EventDialog({
  open,
  onOpenChange,
  contacts,
  event,
  defaultDate,
}: EventDialogProps) {
  const { subAccountId } = useSubAccount();
  const isEdit = !!event;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (event) {
      const start = toDate(event.startAt) ?? new Date();
      const end = toDate(event.endAt) ?? new Date(start.getTime() + 30 * 60000);
      setTitle(event.title);
      setDate(toDateInput(start));
      setStartTime(toTimeInput(start));
      setEndTime(toTimeInput(end));
      setContactId(event.contactId);
      setLocation(event.location ?? "");
      setMeetingUrl(event.meetingUrl ?? "");
      setNotes(event.notes ?? "");
    } else {
      const start = defaultDate
        ? (() => {
            const d = new Date(defaultDate);
            const rounded = roundedNowHour();
            d.setHours(rounded.getHours(), 0, 0, 0);
            return d;
          })()
        : roundedNowHour();
      const end = new Date(start.getTime() + 30 * 60000);
      setTitle("");
      setDate(toDateInput(start));
      setStartTime(toTimeInput(start));
      setEndTime(toTimeInput(end));
      setContactId(null);
      setLocation("");
      setMeetingUrl("");
      setNotes("");
    }
    setErrors({});
  }, [open, event, defaultDate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required";
    if (!date) next.date = "Date is required";
    if (!startTime) next.startTime = "Start time is required";
    if (!endTime) next.endTime = "End time is required";
    const startDt = date && startTime ? fromInputs(date, startTime) : null;
    const endDt = date && endTime ? fromInputs(date, endTime) : null;
    if (startDt && endDt && endDt.getTime() <= startDt.getTime()) {
      next.endTime = "End must be after start";
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !startDt || !endDt) return;

    const trimmedMeetingUrl = meetingUrl.trim();
    const payload: EventFormData = {
      title: title.trim(),
      startAt: startDt,
      endAt: endDt,
      contactId: contactId || null,
      location: location.trim(),
      notes: notes.trim(),
      meetingUrl: trimmedMeetingUrl.length > 0 ? trimmedMeetingUrl : null,
    };

    setSaving(true);
    try {
      if (isEdit && event) {
        // Plain edit has no webhook event — stays a client-side write.
        await updateEvent(event.id, payload);
        toast.success("Event updated");
      } else {
        // Create goes through the server so event.created fires.
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subAccountId,
            title: payload.title,
            startAt: payload.startAt.toISOString(),
            endAt: payload.endAt.toISOString(),
            contactId: payload.contactId,
            location: payload.location,
            notes: payload.notes,
            meetingUrl: payload.meetingUrl,
          }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(b.error ?? "Couldn't save event. Try again.");
          return;
        }
        toast.success("Event created");
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save event. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    if (!confirm(`Delete "${event.title}"?`)) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      toast.success("Event deleted");
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't delete event.");
    } finally {
      setDeleting(false);
    }
  }

  const isBookingPageEvent = event ? eventSource(event) === "booking_page" : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Event" : "New Event"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this event on your calendar."
              : "Add a meeting, call, or any calendar event."}
          </SheetDescription>
        </SheetHeader>

        {isBookingPageEvent && event && (
          <div className="px-4 pt-4">
            <BookingActionsPanel event={event} />
          </div>
        )}

        <form className="space-y-4 p-4 pt-0" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Demo with Sarah"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-date">
              Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ev-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!errors.date}
            />
            {errors.date && (
              <p className="text-xs text-destructive">{errors.date}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start">
                Start <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ev-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-invalid={!!errors.startTime}
              />
              {errors.startTime && (
                <p className="text-xs text-destructive">{errors.startTime}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">
                End <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ev-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-invalid={!!errors.endTime}
              />
              {errors.endTime && (
                <p className="text-xs text-destructive">{errors.endTime}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-contact">Contact</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ContactPicker
                  id="ev-contact"
                  contacts={contacts}
                  value={contactId ?? ""}
                  onChange={(id) => setContactId(id)}
                  placeholder="Optional — link to a contact"
                  title="Link a contact"
                />
              </div>
              {contactId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setContactId(null)}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-meeting-url">
              <Video className="mr-1 inline h-3.5 w-3.5" />
              Meeting URL
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="ev-meeting-url"
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://zoom.us/j/1234567890"
                autoComplete="off"
                spellCheck={false}
              />
              {meetingUrl.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  render={
                    <a
                      href={meetingUrl.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                  className="shrink-0"
                  title="Open the call in a new tab"
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  Join
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Zoom, Google Meet, Whereby, or any video-call link. Booking-page
              events inherit this from the page; edit per-event if you need
              to switch rooms.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-location">
              <MapPin className="mr-1 inline h-3.5 w-3.5" />
              Location
            </Label>
            <Input
              id="ev-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address, meeting room, phone…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-notes">
              <StickyNote className="mr-1 inline h-3.5 w-3.5" />
              Notes
            </Label>
            <Textarea
              id="ev-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Agenda, prep, reminders…"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEdit && (() => {
              // Delete on an ACTIVE booking-page event silently destroys the
              // record without notifying the attendee — a UX trap. Force the
              // operator through "Cancel booking" (in the panel above) so
              // the visitor gets a cancellation email. Delete is only shown
              // for manual events OR booking-page events that have already
              // reached a terminal state (cleanup after the fact).
              const eventStatusNow = event ? eventStatus(event) : "scheduled";
              const isTerminal =
                eventStatusNow === "cancelled" ||
                eventStatusNow === "completed" ||
                eventStatusNow === "no_show";
              if (isBookingPageEvent && !isTerminal) {
                return (
                  <p className="max-w-[60%] text-[11px] text-muted-foreground">
                    Use <strong>Cancel booking</strong> above so the visitor
                    is notified by email. Delete is hidden for active
                    bookings to avoid silent cancellations.
                  </p>
                );
              }
              return (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={saving || deleting}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              );
            })()}
            {!isEdit && <span />}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Event"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Inline panel showing the booking-page status + operator actions.
 * Only mounted when `event.source === "booking_page"`. Surfaces:
 *   - status badge (awaiting payment / confirmed / completed / cancelled / no-show)
 *   - "Mark as paid" for awaiting_payment
 *   - "Mark attended" / "Mark no-show" once the event is in the past
 *   - "Cancel" for any non-terminal state (operator-initiated; emails the visitor)
 *
 * All actions POST to /api/events/[id]/* and reflect locally on success;
 * the calendar's onSnapshot subscription picks up the canonical state
 * once Firestore syncs.
 */
function BookingActionsPanel({ event }: { event: CalendarEvent }) {
  const status = eventStatus(event);
  const startAt = toDate(event.startAt);
  const isPast = startAt ? startAt.getTime() < Date.now() : false;
  const [busy, setBusy] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<EventStatus>(status);

  useEffect(() => {
    setLocalStatus(eventStatus(event));
  }, [event]);

  async function markPaid() {
    setBusy("paid");
    try {
      const res = await fetch(`/api/events/by-id/${event.id}/mark-paid`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't mark as paid.");
      }
      setLocalStatus("scheduled");
      toast.success("Marked as paid. Confirmation sent.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(
    next: "completed" | "no_show" | "cancelled",
    label: string,
  ) {
    if (
      next === "cancelled" &&
      !confirm("Cancel this booking? The visitor is notified by email.")
    ) {
      return;
    }
    setBusy(next);
    try {
      const res = await fetch(`/api/events/by-id/${event.id}/mark-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        notifyEmailSent?: boolean;
        notifyEmailSkipReason?:
          | "not_cancelled"
          | "no_contact"
          | "email_not_configured"
          | "no_contact_email"
          | "contact_opted_out"
          | "missing_records"
          | "bad_timestamps"
          | "send_failed";
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't update.");
      }
      setLocalStatus(next);
      // For cancel: tell the operator what ACTUALLY happened to the
      // visitor notification — not just "Visitor notified" optimistically.
      if (next === "cancelled") {
        if (data.notifyEmailSent) {
          toast.success("Cancelled. Visitor notified by email.");
        } else {
          const reason = data.notifyEmailSkipReason;
          const detail =
            reason === "email_not_configured"
              ? "Resend isn't configured on this deployment"
              : reason === "no_contact_email"
                ? "the visitor's contact record has no email address"
                : reason === "contact_opted_out"
                  ? "the visitor opted out of email"
                  : reason === "send_failed"
                    ? "the email send failed (check Vercel logs)"
                    : "couldn't reach the visitor by email";
          toast.warning(`Cancelled, but ${detail}. Reach out manually.`);
        }
      } else {
        toast.success(label);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const terminal =
    localStatus === "cancelled" ||
    localStatus === "completed" ||
    localStatus === "no_show";

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-400">
          <CalendarClock className="h-3 w-3" />
          From booking page
        </span>
        <BookingStatusBadge status={localStatus} />
        {event.assignedToName && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-400">
            <User className="h-3 w-3" />
            {event.assignedToName}
          </span>
        )}
        {event.paymentAmount != null && event.paymentCurrency && (
          <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:text-zinc-400">
            {event.paymentCurrency} {event.paymentAmount}
          </span>
        )}
      </div>
      {!terminal && (
        <div className="flex flex-wrap items-center gap-1.5">
          {localStatus === "awaiting_payment" && (
            <Button
              type="button"
              size="sm"
              onClick={markPaid}
              disabled={busy !== null}
            >
              {busy === "paid" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <DollarSign className="mr-1 h-3.5 w-3.5" />
              )}
              Mark as paid
            </Button>
          )}
          {localStatus === "scheduled" && isPast && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStatus("completed", "Marked as attended.")}
                disabled={busy !== null}
              >
                {busy === "completed" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                )}
                Mark attended
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStatus("no_show", "Marked as no-show.")}
                disabled={busy !== null}
              >
                {busy === "no_show" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserX className="mr-1 h-3.5 w-3.5" />
                )}
                Mark no-show
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStatus("cancelled", "Cancelled. Visitor notified.")}
            disabled={busy !== null}
            className="text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            {busy === "cancelled" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="mr-1 h-3.5 w-3.5" />
            )}
            Cancel booking
          </Button>
        </div>
      )}

      {/* Reassign host — only renders for team bookings the caller can
          reassign (booking-page event with hosts + admin/current host). */}
      {!terminal && <BookingReassign event={event} />}
    </div>
  );
}

function BookingStatusBadge({ status }: { status: EventStatus }) {
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
