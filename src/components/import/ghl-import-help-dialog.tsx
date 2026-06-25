"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Read-only explainer for the GoHighLevel importer. Opened from the
 * "How it works" button on the Importer tab. Mirrors {@link TeamBookingHelpDialog}'s
 * pattern (Dialog + Section + HelpTable) so the guides feel consistent.
 */
export function GhlImportHelpDialog({
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
          <DialogTitle>How the GoHighLevel importer works</DialogTitle>
          <DialogDescription>
            Move a client&apos;s CRM data out of GoHighLevel and into this
            sub-account — safely, and as many times as you need.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <Section title="Use it when">
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                You&apos;re migrating a client off GoHighLevel and want to keep
                their <strong className="text-foreground">contacts, deal
                history, and notes</strong> — not start from a blank CRM.
              </li>
              <li>
                You&apos;d like to do it{" "}
                <strong className="text-foreground">without spreadsheets</strong>
                {" "}— it pulls straight from GoHighLevel&apos;s API.
              </li>
              <li>
                You want a <strong className="text-foreground">safe, repeatable</strong>{" "}
                run — re-importing updates records in place instead of
                duplicating them (matched on each record&apos;s GoHighLevel id).
              </li>
            </ul>
          </Section>

          <Section title="What comes across">
            <HelpTable
              head={["From GoHighLevel", "Lands here as"]}
              rows={[
                [
                  "Contacts",
                  "Name, email, phone, company, address, tags, and source — plus any custom fields you map.",
                ],
                [
                  "Opportunities",
                  "Deals — title, value, and stage. Each GHL stage maps to one of your pipeline stages; Won / Lost are honoured.",
                ],
                [
                  "Notes",
                  "A contact's notes / history, attached to the right contact.",
                ],
                [
                  "Custom fields",
                  "GoHighLevel custom fields become LeadStack custom fields — you confirm the names + types before importing.",
                ],
              ]}
            />
          </Section>

          <Section title="What doesn't (rebuild these here)">
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">
                  Workflows, funnels, websites/pages, calendars, forms, and saved
                  templates
                </strong>{" "}
                — GoHighLevel can&apos;t export these, so they&apos;re rebuilt
                natively in this platform.
              </li>
              <li>
                <strong className="text-foreground">
                  Files / media and message threads
                </strong>{" "}
                (SMS + email conversation history) — not part of this version.
              </li>
            </ul>
          </Section>

          <Section title="The steps">
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Connect</strong> — in
                GoHighLevel, open{" "}
                <strong className="text-foreground">
                  Settings → Private Integrations
                </strong>{" "}
                and create a token, then paste it here with the sub-account&apos;s
                location id. We validate it and read a preview.
              </li>
              <li>
                <strong className="text-foreground">Review the mapping</strong> —
                we auto-suggest how GHL pipeline stages + custom fields map in.
                Adjust anything, then confirm.
              </li>
              <li>
                <strong className="text-foreground">Run</strong> — the import
                works through contacts → opportunities → notes in the background.
                You can leave the page; live progress shows created / updated
                counts as it goes.
              </li>
              <li>
                <strong className="text-foreground">Done</strong> — a summary
                shows the totals and lists any skipped records with the reason.
              </li>
            </ol>
          </Section>

          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            In short: connect, confirm the mapping, and let it run — contacts,
            deals, and notes come across, and re-running is always safe.
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
