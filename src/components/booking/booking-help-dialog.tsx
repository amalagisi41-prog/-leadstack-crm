"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Read-only explainer for operators: how booking pages work end-to-end.
 * Mirrors the territory help dialog pattern — open from the "How it
 * works" button on the booking list page header.
 *
 * Content is grouped to follow the natural setup → live → ongoing flow
 * an operator will walk through, so it doubles as a quick-start guide.
 */
export function BookingHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>How booking pages work</DialogTitle>
          <DialogDescription>
            A quick reference for admins setting up + running booking
            pages. Off by default — create one to switch the feature on
            for this sub-account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <p className="text-muted-foreground">
            A <strong className="text-foreground">booking page</strong> is
            a branded public URL where leads pick a slot. Each page has
            its own working hours, slot length, intake form, optional
            PayPal deposit, and built-in reminders + reschedule / cancel.
            Replaces Calendly / Cal.com for the common case.
          </p>

          <Section title="Lifecycle of a booking">
            <HelpTable
              head={["Stage", "What happens"]}
              rows={[
                [
                  "Visitor picks a slot",
                  "Public page at /b/[sa]/[slug] shows live availability. They fill name/email/phone + your intake fields and submit.",
                ],
                [
                  "Confirmation",
                  "If no deposit: status flips to Confirmed, an email + .ics calendar invite goes out.",
                ],
                [
                  "Awaiting payment",
                  "If a deposit is required: status holds in Awaiting payment, a PayPal.me link emails to the visitor. You mark paid manually once the funds land.",
                ],
                [
                  "Reminders",
                  "T-24h and T-1h emails fire automatically (skipped on cancelled / unpaid holds).",
                ],
                [
                  "Reschedule / cancel",
                  "Visitor has a link in every email. Reschedule keeps the same booking; cancel releases the slot.",
                ],
                [
                  "After the meeting",
                  "Mark Attended or No-show from the event dialog. Both write to the contact timeline.",
                ],
              ]}
            />
          </Section>

          <Section title="Status badges, in one place">
            <HelpTable
              head={["Status", "Slot held?", "Reminders fire?"]}
              rows={[
                ["Confirmed", "Yes", "Yes (T-24h + T-1h)"],
                ["Awaiting payment", "Yes (auto-released after the hold window)", "No (start on Mark as paid)"],
                ["Cancelled", "No", "No"],
                ["Completed", "No (in the past)", "n/a"],
                ["No-show", "No (in the past)", "n/a"],
              ]}
            />
          </Section>

          <Section title="Slot rules in plain English">
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Duration</strong> is
                how long a meeting lasts; visitors pick from contiguous
                blocks of that size.
              </li>
              <li>
                <strong className="text-foreground">Buffer</strong> is
                the gap padded between back-to-back meetings — set to
                0 for tight booking.
              </li>
              <li>
                <strong className="text-foreground">Working hours</strong>
                {" "}are per day of the week, multiple ranges allowed
                (e.g. 9-12, 13-17 to skip lunch). Times sit in the
                page&apos;s timezone — the visitor sees their own.
              </li>
              <li>
                <strong className="text-foreground">Min notice</strong>
                {" "}blocks bookings closer than X hours from now.
              </li>
              <li>
                <strong className="text-foreground">Visible days</strong>
                {" "}is how far into the future the picker shows.
              </li>
              <li>
                <strong className="text-foreground">Max per day</strong>
                {" "}caps total bookings per day; leave blank for
                unlimited.
              </li>
            </ul>
          </Section>

          <Section title="Payment (PayPal.me)">
            <p className="text-muted-foreground">
              When a deposit is required, the visitor lands on a PayPal
              page with the amount pre-filled. PayPal.me doesn&apos;t
              call back when payment arrives — you watch your PayPal
              inbox and click{" "}
              <strong className="text-foreground">Mark as paid</strong>
              {" "}on the event in your calendar. Unpaid holds auto-cancel
              after the hold window so the slot frees up.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Connect your PayPal.me username under Settings → Payments
              first. The payment section in the editor stays disabled
              until that&apos;s done.
            </p>
          </Section>

          <Section title="What the visitor receives, by stage">
            <HelpTable
              head={["Stage", "Email sent"]}
              rows={[
                ["Confirmed (no payment)", "Confirmation + .ics invite + reschedule / cancel link"],
                ["Awaiting payment", "Pay-to-confirm email with the PayPal link"],
                ["Mark as paid", "Fresh confirmation + .ics invite (replaces the hold email)"],
                ["T-24h / T-1h before", "Reminder with the reschedule / cancel link"],
                ["Cancelled / hold expired", "Heads-up that the slot has been released"],
                ["Rescheduled", "Updated confirmation with the new time (calendar apps overwrite the prior invite)"],
              ]}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              All emails send via your sub-account&apos;s verified Resend
              domain when configured — otherwise the deployment-wide
              shared sender.
            </p>
          </Section>

          <Section title="Operator actions, in one place">
            <HelpTable
              head={["From", "What you can do"]}
              rows={[
                ["Booking page editor", "Edit slot rules, intake fields, payment, reminders. Publish / unpublish."],
                ["Booking page detail", "Quick stats + jump to bookings list. Copy public link. Open page."],
                ["Bookings list", "Filter by status (Upcoming / Awaiting payment / Past / Cancelled / No-show). Search by attendee."],
                ["Calendar event dialog", "Mark as paid · Mark attended · Mark no-show · Cancel booking."],
              ]}
            />
          </Section>

          <Section title="Territory routing (when scoping is on)">
            <p className="text-muted-foreground">
              The editor surfaces a{" "}
              <strong className="text-foreground">
                Default territory for new leads
              </strong>{" "}
              picker. New contacts created via this page land in that
              territory; defaults to Global (visible to every rep). When
              territory scoping is off, the picker is hidden entirely —
              new contacts go to Global as the inbound-lead default.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Useful for multi-region sub-accounts: separate pages for
              each region auto-route inbound leads to the right team.
            </p>
          </Section>

          <Section title="Getting started — your first page">
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Click{" "}
                <strong className="text-foreground">
                  + New booking page
                </strong>.
              </li>
              <li>
                Set the name (&ldquo;30-min consultation&rdquo;), slot
                duration, working hours, timezone.
              </li>
              <li>
                Optional: add a few intake questions (&ldquo;What
                would you like to discuss?&rdquo;).
              </li>
              <li>
                Save as a draft — public link stays private. Click
                Publish when you&apos;re ready.
              </li>
              <li>
                Copy the URL and paste into your email signature, your
                website, or the{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                  {"{{bookingLink}}"}
                </code>{" "}
                automation merge tag.
              </li>
            </ol>
          </Section>

          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            In short: a published booking page is a self-service slot
            picker for your leads. Confirmation, reminders, calendar
            invites, reschedule, cancel, and (optionally) deposit
            collection are all handled — you just decide who can book
            when, and review the resulting bookings in the calendar.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function HelpTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b align-top last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={
                    j === 0
                      ? "px-3 py-2 font-medium"
                      : "px-3 py-2 text-muted-foreground"
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
