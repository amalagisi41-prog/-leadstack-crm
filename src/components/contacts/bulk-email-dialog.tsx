"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { PIPELINE_STAGES } from "@/types/deals";
import type { Contact } from "@/types/contacts";
import type {
  BroadcastAudienceFilter,
  MessageTemplateDoc,
} from "@/types";

interface BulkEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All contacts loaded into the page — used for the live audience preview. */
  contacts: Contact[];
}

type FilterKind = "all" | "tag" | "pipeline_stage";

/**
 * Bulk-email composer. Operator picks an email template and an audience
 * filter (all / tag / pipeline stage), gets a live count of who'll receive
 * the send (and how many will be skipped for opt-out / missing email), then
 * confirms.
 *
 * The actual send is owned by /api/broadcasts/email/send — this dialog just
 * collects + confirms input. Audience preview is computed client-side from
 * the already-loaded contacts list (no extra round-trip); the server
 * recomputes the canonical audience at fan-out time.
 */
export function BulkEmailDialog({
  open,
  onOpenChange,
  contacts,
}: BulkEmailDialogProps) {
  const router = useRouter();
  const { agencyId, subAccountId, saPath } = useSubAccount();

  const [templates, setTemplates] = useState<MessageTemplateDoc[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterTag, setFilterTag] = useState("");
  const [filterStage, setFilterStage] = useState<string>(
    PIPELINE_STAGES[0]?.id ?? "new",
  );
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Reset form when reopened.
  useEffect(() => {
    if (open) {
      setTemplateId("");
      setFilterKind("all");
      setFilterTag("");
      setFilterStage(PIPELINE_STAGES[0]?.id ?? "new");
      setApiError(null);
    }
  }, [open]);

  // Subscribe to email templates for this sub-account.
  useEffect(() => {
    if (!open || !agencyId) return;
    setTemplatesLoading(true);
    const q = query(
      collection(getFirebaseDb(), "message_templates"),
      where("subAccountId", "==", subAccountId),
      where("type", "==", "email"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MessageTemplateDoc);
        list.sort((a, b) => a.name.localeCompare(b.name));
        setTemplates(list);
        setTemplatesLoading(false);
      },
      () => setTemplatesLoading(false),
    );
    return () => unsub();
  }, [open, agencyId, subAccountId]);

  // Distinct tags across all loaded contacts — drives the tag dropdown.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      for (const t of c.tags ?? []) {
        if (t.trim()) set.add(t.trim());
      }
    }
    return Array.from(set).sort();
  }, [contacts]);

  // Live audience preview — match the same filter shape the server applies.
  const preview = useMemo(() => {
    let matching: Contact[];
    if (filterKind === "tag") {
      if (!filterTag) return { recipients: 0, skipped: 0, matching: 0 };
      matching = contacts.filter((c) => (c.tags ?? []).includes(filterTag));
    } else if (filterKind === "pipeline_stage") {
      matching = contacts.filter((c) => c.pipelineStage === filterStage);
    } else {
      matching = contacts;
    }
    let recipients = 0;
    let skipped = 0;
    for (const c of matching) {
      if (c.emailOptedOut) {
        skipped += 1;
        continue;
      }
      if (!c.email || !c.email.includes("@")) {
        skipped += 1;
        continue;
      }
      recipients += 1;
    }
    return { recipients, skipped, matching: matching.length };
  }, [contacts, filterKind, filterTag, filterStage]);

  const canSubmit =
    templateId &&
    preview.recipients > 0 &&
    !sending &&
    (filterKind !== "tag" || filterTag);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!templateId) {
      setApiError("Pick an email template.");
      return;
    }
    if (preview.recipients === 0) {
      setApiError("No recipients match this filter.");
      return;
    }
    let audienceFilter: BroadcastAudienceFilter;
    if (filterKind === "tag") {
      if (!filterTag) {
        setApiError("Pick a tag.");
        return;
      }
      audienceFilter = { kind: "tag", tag: filterTag };
    } else if (filterKind === "pipeline_stage") {
      audienceFilter = { kind: "pipeline_stage", stage: filterStage };
    } else {
      audienceFilter = { kind: "all" };
    }

    setSending(true);
    try {
      const res = await fetch("/api/broadcasts/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subAccountId,
          templateId,
          audienceFilter,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        broadcastId?: string;
        queued?: number;
        skipped?: number;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.broadcastId) {
        setApiError(data.error ?? "Couldn't send. Try again.");
        return;
      }
      toast.success(
        `Bulk email queued — ${data.queued ?? 0} recipients${
          data.skipped ? ` (${data.skipped} skipped)` : ""
        }`,
      );
      onOpenChange(false);
      router.push(saPath(`/broadcasts/${data.broadcastId}`));
    } catch (err) {
      console.error(err);
      setApiError("Network error. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Mail className="h-4 w-4" />
            </span>
            Send bulk email
          </DialogTitle>
          <DialogDescription>
            Pick a template and an audience. Opted-out contacts and contacts
            without an email are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-template">Template</Label>
            {templatesLoading ? (
              <div className="h-10 w-full animate-pulse rounded-md border bg-muted/30" />
            ) : templates.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                No email templates yet.{" "}
                <a
                  className="underline"
                  href={saPath("/templates/new")}
                >
                  Create one
                </a>{" "}
                first — bulk email reuses the same template engine as
                automations.
              </p>
            ) : (
              <select
                id="bulk-template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="block w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Pick an email template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.subject ? ` — ${t.subject}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-filter-kind">Audience</Label>
            <select
              id="bulk-filter-kind"
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as FilterKind)}
              className="block w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All contacts in this sub-account</option>
              <option value="tag" disabled={allTags.length === 0}>
                Contacts with a specific tag{allTags.length === 0 ? " (no tags exist yet)" : ""}
              </option>
              <option value="pipeline_stage">
                Contacts in a pipeline stage
              </option>
            </select>
          </div>

          {filterKind === "tag" && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-filter-tag">Tag</Label>
              <select
                id="bulk-filter-tag"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="block w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Pick a tag…</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}

          {filterKind === "pipeline_stage" && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-filter-stage">Pipeline stage</Label>
              <select
                id="bulk-filter-stage"
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value)}
                className="block w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Will receive email</span>
              <span className="font-mono font-semibold">
                {preview.recipients}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Skipped (opted out / no email)</span>
              <span className="font-mono">{preview.skipped}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Total matching</span>
              <span className="font-mono">{preview.matching}</span>
            </div>
          </div>

          {apiError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {apiError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {sending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="mr-1 h-4 w-4" />
                  Send to {preview.recipients}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
