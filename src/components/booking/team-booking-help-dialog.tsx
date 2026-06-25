"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Read-only explainer for the multi-host ("team") booking feature. Opened
 * from the "How it works" button in the Hosts / team section of the booking
 * page editor. Mirrors {@link BookingHelpDialog}'s pattern (Dialog + Section
 * + HelpTable) so the two guides feel consistent.
 */
export function TeamBookingHelpDialog({
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
          <DialogTitle>How team booking works</DialogTitle>
          <DialogDescription>
            Run one booking page across several people — availability pools
            across the team and each booking is auto-assigned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <p className="text-muted-foreground">
            Add one or more team members as{" "}
            <strong className="text-foreground">hosts</strong> to turn a
            booking page into a shared team calendar. A time slot stays open
            while <strong className="text-foreground">any</strong> host is
            free, and each booking is automatically assigned to the least-busy
            available host. Leave hosts empty to keep a single shared schedule
            (the original behaviour).
          </p>

          <Section title="Turn it on">
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Make sure each host is an{" "}
                <strong className="text-foreground">active member</strong> of
                this sub-account (Settings → Members). Only active members
                appear in the host list.
              </li>
              <li>
                In the{" "}
                <strong className="text-foreground">Hosts / team</strong>{" "}
                section above, tick the members who should take bookings on
                this page.
              </li>
              <li>
                <strong className="text-foreground">Save</strong>. The hint
                under the host list confirms the page is now in team mode.
              </li>
            </ol>
          </Section>

          <Section title="What changes">
            <HelpTable
              head={["Area", "Behaviour"]}
              rows={[
                [
                  "Availability",
                  "Pools across hosts — a slot is offered while ANY host is free, so a 3-host page can take 3 bookings at the same time instead of one.",
                ],
                [
                  "Assignment",
                  "Each booking auto-goes to the least-busy free host. The customer doesn't choose a person and doesn't see a host name.",
                ],
                [
                  "Customer emails",
                  "Confirmation + reminders stay business-branded — no host name is shown to the contact.",
                ],
                [
                  "Internal",
                  "The assigned host shows on the calendar event and in the .ics calendar-feed title (e.g. “Cleaning — Priya”).",
                ],
                [
                  "Per-person calendars",
                  "Each host can subscribe to only their own bookings via Settings → Calendar sync → “Just my bookings”.",
                ],
              ]}
            />
          </Section>

          <Section title="Good to know">
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                All hosts share{" "}
                <strong className="text-foreground">
                  the page&apos;s working hours
                </strong>
                ; they differ only by their own existing bookings. Per-host
                hours (e.g. &ldquo;only Tue/Thu&rdquo;) isn&apos;t available
                yet.
              </li>
              <li>
                Assignment only considers{" "}
                <strong className="text-foreground">LeadStack bookings</strong>
                {" "}— it won&apos;t avoid time a host blocked in their personal
                Google / Outlook calendar yet (that&apos;s the two-way-sync
                upgrade).
              </li>
              <li>
                Remove a host by unticking + saving — their existing bookings
                keep their assignment. Untick everyone to return the page to a
                single shared schedule.
              </li>
            </ul>
          </Section>

          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            In short: add hosts to pool availability and share the load
            automatically — customers see one simple page, and each booking
            lands with the least-busy teammate.
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
