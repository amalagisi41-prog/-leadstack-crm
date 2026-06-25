"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Read-only explainer for admins: how territory scoping decides
 * visibility, where each record's territory comes from, who can change
 * it, and what happens when a member's vs a contact's territory changes.
 * Opened from the Territory Scoping settings section.
 */
export function TerritoryHelpDialog({
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
          <DialogTitle>How territory scoping works</DialogTitle>
          <DialogDescription>
            A quick reference for admins. Collaborators never see this.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <p className="text-muted-foreground">
            Territory is an attribute of the{" "}
            <strong className="text-foreground">contact</strong> (the
            &ldquo;account&rdquo;). Deals, quotes, tasks, and events{" "}
            <strong className="text-foreground">inherit</strong> their
            contact&apos;s territory. Each{" "}
            <strong className="text-foreground">member</strong> has a list of
            assigned territories that controls only what they{" "}
            <em>see</em> — records are never owned by an individual rep.
          </p>

          <Section title="Who sees what (scoping on)">
            <HelpTable
              head={["Viewer", "Territory-tagged records", "Global records"]}
              rows={[
                ["Agency owner", "All", "All"],
                ["Workspace admin", "All", "All"],
                ["Collaborator", "Assigned only", "Yes (shared)"],
              ]}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Every record always has a territory — a real one or{" "}
              <strong>Global</strong>. There&apos;s no &ldquo;unassigned&rdquo;
              state. When scoping is <strong>off</strong>, everyone sees
              everything and the territory tag is stored but ignored.
            </p>
          </Section>

          <Section title="Where a record's territory comes from">
            <HelpTable
              head={["Record", "Territory source"]}
              rows={[
                [
                  "Contact",
                  "Set on the contact. Defaults: single-territory rep → their territory; otherwise Global. Inbound leads (form / chat / voice) → Global.",
                ],
                ["Deal", "Inherited from its contact (re-derives if an admin re-homes it to another contact)."],
                ["Quote", "Inherited from its contact."],
                ["Task / Event", "Inherited from the linked contact (Global if standalone)."],
              ]}
            />
          </Section>

          <Section title="Who can change a record's territory">
            <HelpTable
              head={["Action", "Collaborator", "Admin / Owner"]}
              rows={[
                ["Re-tag a contact's territory", "No", "Yes — moves the whole account"],
                ["Change a deal's contact", "No (read-only)", "Yes"],
                ["Edit a record they can see", "Yes (territory stays put)", "Yes"],
                ["Change a member's territories", "No", "Yes"],
              ]}
            />
          </Section>

          <Section title="When a MEMBER's territory changes">
            <p className="text-muted-foreground">
              Example: a rep moves California → Utah (you edit their assigned
              territories in Members).
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">
                  Only their visibility changes — no records move.
                </strong>{" "}
                It updates live.
              </li>
              <li>
                They stop seeing California records and start seeing Utah ones
                (Global stays visible to everyone).
              </li>
              <li>
                California records stay California — now seen by whoever else
                covers California.
              </li>
              <li>
                Records they created don&apos;t follow them; those belong to
                the contact&apos;s territory. Nothing to migrate.
              </li>
            </ul>
          </Section>

          <Section title="When a CONTACT's territory changes">
            <p className="text-muted-foreground">
              Example: an account is re-tagged California → Utah (you change it
              on the contact profile).
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                The contact{" "}
                <strong className="text-foreground">
                  and all its deals, quotes, tasks, and events
                </strong>{" "}
                move to Utah together, and an activity entry is logged.
              </li>
              <li>
                California reps stop seeing the account; Utah reps start seeing
                it — the whole account moves as one unit.
              </li>
              <li>
                To make an account visible to every rep again, set it back to{" "}
                <strong className="text-foreground">Global</strong> — the
                shared pool. Global is the floor; there&apos;s no
                &ldquo;unassigned&rdquo; option.
              </li>
            </ul>
          </Section>

          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            In short: a <strong className="text-foreground">member&apos;s</strong>{" "}
            territory is a view filter (changing it moves no data); a{" "}
            <strong className="text-foreground">contact&apos;s</strong>{" "}
            territory is the data&apos;s actual home (changing it moves the
            whole account, children included).
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
