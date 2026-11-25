"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToReviewRequests } from "@/lib/firestore/review-requests";
import { realRecords } from "@/lib/sample-data/counting";
import { STATUS_LABEL, reviewReasonText } from "@/lib/reviews/reasons";
import { ReviewAutomationCard } from "@/components/reviews/review-automation-card";
import {
  DEFAULT_REVIEW_AUTOMATION_MODE,
  type ReviewRequestDoc,
  type ReviewRequestStatus,
} from "@/types/review-requests";
import type { Contact } from "@/types/contacts";

const STATUS_TONE: Record<ReviewRequestStatus, string> = {
  queued: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  would_send: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  sent: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  failed: "bg-red-500/10 text-red-700 dark:text-red-400",
  skipped: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  cancelled: "bg-muted text-muted-foreground",
};

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate() : null;
}
function fmt(v: unknown): string {
  const d = asDate(v);
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

const TRIGGER_LABEL: Record<string, string> = {
  deal_won: "Deal closed",
  manual: "Sent by hand",
  quote_paid: "Invoice paid",
  deal_completed: "Deal marked completed",
  workflow: "Workflow",
};

export default function ReviewRequestsPage() {
  const { subAccountId, agencyId, subAccount, isAdmin, saPath } = useSubAccount();
  const { user } = useAuth();
  const [rows, setRows] = useState<ReviewRequestDoc[] | null>(null);
  const [error, setError] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToReviewRequests(subAccountId, setRows, () => setError(true));
  }, [subAccountId]);

  useEffect(() => {
    if (!user || !agencyId) return;
    return subscribeToContacts({ agencyId, subAccountId }, (list) => setContacts(realRecords(list)));
  }, [user, agencyId, subAccountId]);

  const cfg = subAccount?.googleReviewConfig ?? null;
  const mode = cfg?.automationMode ?? DEFAULT_REVIEW_AUTOMATION_MODE;
  const settingsHref = `${saPath("/dashboard/settings")}?tab=messaging#google-reviews`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Requests</h1>
          <p className="text-muted-foreground text-sm">
            Every Google review request — automatic after closing or sent by hand — and exactly
            what happened to it. Automation:{" "}
            <span className="text-foreground font-medium">
              {mode === "live" ? "Live" : mode === "off" ? "Off" : "Log only"}
            </span>
            .
          </p>
        </div>
        <Button onClick={() => setSendOpen(true)}>
          <Send className="mr-1 h-4 w-4" />
          Send review request
        </Button>
      </div>

      <ReviewAutomationCard
        subAccountId={subAccountId}
        config={cfg}
        canEdit={isAdmin}
        settingsHref={settingsHref}
      />

      {error ? (
        <p className="bg-card rounded-xl border p-4 text-sm">
          We couldn&apos;t load review requests. Refresh to try again.
        </p>
      ) : rows === null ? (
        <div className="text-muted-foreground flex h-24 items-center justify-center text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading review requests…
        </div>
      ) : rows.length === 0 ? (
        <section className="bg-card/50 rounded-xl border border-dashed p-10 text-center" data-testid="review-empty">
          <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <Star className="text-primary h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold">No review requests yet</h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-lg text-sm">
            When a deal reaches Closed (won), a review request is created for its contact and
            scheduled {cfg?.delayDaysAfterClosing === 0 ? "right away" : "for the number of days after closing set above"}.
            {mode === "log_only"
              ? " The automation is in Log only mode, so each one is recorded here but nothing is sent."
              : mode === "off"
                ? " The automation is Off, so closed deals don't create requests."
                : " The automation is Live, so each one is sent at its scheduled time."}{" "}
            You can also use Send review request at the top of this page.
          </p>
        </section>
      ) : (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Deal / closing</th>
                <th className="px-4 py-2 font-medium">Send time</th>
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Review link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ReviewRow
                  key={r.id}
                  row={r}
                  open={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  contactHref={saPath(`/contacts/${r.contactId}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SendReviewDialog open={sendOpen} onOpenChange={setSendOpen} contacts={contacts} />
    </div>
  );
}

function ReviewRow({
  row,
  open,
  onToggle,
  contactHref,
}: {
  row: ReviewRequestDoc;
  open: boolean;
  onToggle: () => void;
  contactHref: string;
}) {
  const last = row.events?.[row.events.length - 1];
  return (
    <>
      <tr className="border-t align-top">
        <td className="px-4 py-3">
          <a href={contactHref} className="font-medium hover:underline">
            {row.contactName}
          </a>
          <p className="text-muted-foreground text-xs">
            {TRIGGER_LABEL[row.trigger] ?? row.trigger}
            {row.channel ? ` · ${row.channel === "sms" ? "Text" : "WhatsApp"}` : ""}
          </p>
        </td>
        <td className="px-4 py-3">{row.dealTitle ?? "—"}</td>
        <td className="px-4 py-3">{row.scheduledFor ? fmt(row.scheduledFor) : "Immediately"}</td>
        <td className="px-4 py-3">{row.sentAt ? fmt(row.sentAt) : "—"}</td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[row.status]}`}>
            {STATUS_LABEL[row.status]}
          </span>
          {row.reason && row.status !== "would_send" ? (
            <p className="text-muted-foreground mt-1 max-w-56 text-xs">{reviewReasonText(row.reason)}</p>
          ) : null}
        </td>
        <td className="px-4 py-3 text-xs">{row.reviewLinkSet ? "Set" : "Not set"}</td>
      </tr>
      <tr>
        <td colSpan={6} className="px-4 pb-3">
          <button type="button" onClick={onToggle} className="text-muted-foreground text-xs hover:underline">
            {open ? "Hide log" : `Show log (${row.events?.length ?? 0})`}
            {!open && last ? ` · ${last.message}` : ""}
          </button>
          {open ? (
            <ol className="mt-2 space-y-1 border-l pl-3 text-xs" data-testid="review-log">
              {(row.events ?? []).map((e, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">{fmt(e.at)}</span> — {e.message}
                </li>
              ))}
            </ol>
          ) : null}
        </td>
      </tr>
    </>
  );
}

function SendReviewDialog({
  open,
  onOpenChange,
  contacts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
}) {
  const [contactId, setContactId] = useState("");
  const [sending, setSending] = useState(false);
  const withPhone = useMemo(() => contacts.filter((c) => !!c.phone), [contacts]);

  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/comms/review-request/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; sent?: boolean };
      if (!res.ok || !data.sent) {
        // The exact reason — never a pretend success. It is also on the log.
        toast.error(data.error ?? "Not sent. See the Review Requests log for the reason.");
        return;
      }
      toast.success("Review request sent.");
      onOpenChange(false);
      setContactId("");
    } catch {
      toast.error("Not sent — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send review request</DialogTitle>
          <DialogDescription>
            Sends now, with no delay, by text message or WhatsApp — whichever your Google review
            settings use. It&apos;s logged on this page either way.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="review-contact">Contact</Label>
          <select
            id="review-contact"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="">Choose a contact…</option>
            {withPhone.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.phone}
              </option>
            ))}
          </select>
          {withPhone.length < contacts.length ? (
            <p className="text-muted-foreground text-xs">
              Only contacts with a phone number are listed.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!contactId || sending}>
            {sending ? "Sending…" : "Send now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
