"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  collection,
  getDocs,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { PIPELINE_STAGES } from "@/types/deals";
import type { Contact } from "@/types/contacts";
import type { BroadcastAudienceFilter, VoiceCampaignDoc } from "@/types";

interface BulkCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All contacts loaded into the page — used for the live audience preview. */
  contacts: Contact[];
}

type FilterKind = "all" | "tag" | "pipeline_stage";

/**
 * Bulk outbound AI-call composer. Operator picks an audience filter
 * (all / tag / pipeline stage), sees a live count of who'll be called
 * (and who's skipped for opt-out / missing-or-invalid phone), confirms
 * consent, and fires the whole list in one action.
 *
 * The send is owned by /api/comms/voice/campaign/send — this dialog just
 * collects + confirms. The audience preview is computed client-side from
 * the loaded contacts; the server recomputes canonically at fan-out time,
 * and the per-call compliance gate (window / caps / etc.) runs per call.
 */
export function BulkCallDialog({
  open,
  onOpenChange,
  contacts,
}: BulkCallDialogProps) {
  const router = useRouter();
  const { subAccountId, saPath } = useSubAccount();

  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterTag, setFilterTag] = useState("");
  const [filterStage, setFilterStage] = useState<string>(
    PIPELINE_STAGES[0]?.id ?? "new",
  );
  const [consentAck, setConsentAck] = useState(false);
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Campaign identity + suppression.
  const [campaignName, setCampaignName] = useState("");
  const [suppressRecent, setSuppressRecent] = useState(true);
  const [recentDays, setRecentDays] = useState(30);
  const [excludeCampaignId, setExcludeCampaignId] = useState("");
  const [excludeTag, setExcludeTag] = useState("");
  const [pastCampaigns, setPastCampaigns] = useState<VoiceCampaignDoc[]>([]);

  useEffect(() => {
    if (open) {
      setFilterKind("all");
      setFilterTag("");
      setFilterStage(PIPELINE_STAGES[0]?.id ?? "new");
      setConsentAck(false);
      setApiError(null);
      setCampaignName("");
      setSuppressRecent(true);
      setRecentDays(30);
      setExcludeCampaignId("");
      setExcludeTag("");
    }
  }, [open]);

  // Load this sub-account's past campaigns for the "exclude a prior
  // campaign" picker.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(getFirebaseDb(), "voiceCampaigns"),
            where("subAccountId", "==", subAccountId),
          ),
        );
        if (cancelled) return;
        const list = snap.docs.map((d) => d.data() as VoiceCampaignDoc);
        list.sort(
          (a, b) =>
            ((b.createdAt as Timestamp | null)?.toMillis?.() ?? 0) -
            ((a.createdAt as Timestamp | null)?.toMillis?.() ?? 0),
        );
        setPastCampaigns(list.slice(0, 25));
      } catch {
        /* non-fatal — picker just stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, subAccountId]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      for (const t of c.tags ?? []) {
        if (t.trim()) set.add(t.trim());
      }
    }
    return Array.from(set).sort();
  }, [contacts]);

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
    const recentCutoffMs =
      suppressRecent && recentDays > 0
        ? Date.now() - recentDays * 24 * 60 * 60 * 1000
        : null;
    let recipients = 0;
    let skipped = 0;
    let suppressed = 0;
    for (const c of matching) {
      if (c.voiceOptedOut === true) {
        skipped += 1;
        continue;
      }
      const parsed = c.phone ? parsePhoneNumberFromString(c.phone) : null;
      if (!parsed || !parsed.isValid()) {
        skipped += 1;
        continue;
      }
      // Suppression we can evaluate client-side (tag + recently-called).
      // Prior-campaign exclusion is applied server-side at launch.
      if (excludeTag && (c.tags ?? []).includes(excludeTag)) {
        suppressed += 1;
        continue;
      }
      if (recentCutoffMs) {
        const last = c.lastOutboundCallAt as Timestamp | null | undefined;
        const lastMs =
          last && typeof last.toMillis === "function" ? last.toMillis() : 0;
        if (lastMs >= recentCutoffMs) {
          suppressed += 1;
          continue;
        }
      }
      recipients += 1;
    }
    return { recipients, skipped, suppressed, matching: matching.length };
  }, [
    contacts,
    filterKind,
    filterTag,
    filterStage,
    excludeTag,
    suppressRecent,
    recentDays,
  ]);

  const canSubmit =
    preview.recipients > 0 &&
    consentAck &&
    !sending &&
    (filterKind !== "tag" || filterTag);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (preview.recipients === 0) {
      setApiError("No contacts match this filter.");
      return;
    }
    if (!consentAck) {
      setApiError("Confirm consent before starting the campaign.");
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
      const res = await fetch("/api/comms/voice/campaign/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subAccountId,
          audienceFilter,
          consentAck: true,
          name: campaignName.trim() || undefined,
          suppression: {
            recentDays: suppressRecent && recentDays > 0 ? recentDays : null,
            excludeCampaignId: excludeCampaignId || null,
            excludeTag: excludeTag || null,
          },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        campaignId?: string;
        queued?: number;
        skipped?: number;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.campaignId) {
        setApiError(data.error ?? "Couldn't start the campaign. Try again.");
        return;
      }
      toast.success(
        `Calling campaign queued — ${data.queued ?? 0} contacts${
          data.skipped ? ` (${data.skipped} skipped)` : ""
        }`,
      );
      onOpenChange(false);
      router.push(saPath(`/ai-agents/outbound/campaigns/${data.campaignId}`));
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
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <PhoneOutgoing className="h-4 w-4" />
            </span>
            Bulk AI call
          </DialogTitle>
          <DialogDescription>
            The AI agent calls everyone in the audience with your outbound
            opener. Opted-out contacts and those without a valid phone are
            skipped; each call is screened by the compliance gate (calling
            window, caps) and paced automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-call-name">Campaign name (optional)</Label>
            <Input
              id="bulk-call-name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g. 30-Day Challenge — free trials"
              maxLength={120}
            />
            <p className="text-[11px] text-muted-foreground">
              A code like <span className="font-mono">VC-2026-0001</span> is
              assigned automatically for the audit trail.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-call-filter-kind">Audience</Label>
            <select
              id="bulk-call-filter-kind"
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as FilterKind)}
              className="block w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All contacts in this sub-account</option>
              <option value="tag" disabled={allTags.length === 0}>
                Contacts with a specific tag
                {allTags.length === 0 ? " (no tags exist yet)" : ""}
              </option>
              <option value="pipeline_stage">Contacts in a pipeline stage</option>
            </select>
          </div>

          {filterKind === "tag" && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-call-tag">Tag</Label>
              <select
                id="bulk-call-tag"
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
              <Label htmlFor="bulk-call-stage">Pipeline stage</Label>
              <select
                id="bulk-call-stage"
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

          {/* Suppression */}
          <fieldset className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Don&apos;t re-call
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={suppressRecent}
                onChange={(e) => setSuppressRecent(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <span>Skip anyone called in the last</span>
              <Input
                type="number"
                min={1}
                max={365}
                value={recentDays}
                onChange={(e) => setRecentDays(Number(e.target.value) || 0)}
                disabled={!suppressRecent}
                className="h-7 w-16"
              />
              <span>days</span>
            </label>
            <div className="space-y-1">
              <Label htmlFor="bulk-call-exclude-campaign" className="text-xs">
                Exclude everyone from a previous campaign
              </Label>
              <select
                id="bulk-call-exclude-campaign"
                value={excludeCampaignId}
                onChange={(e) => setExcludeCampaignId(e.target.value)}
                className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">None</option>
                {pastCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                    {c.name ? ` · ${c.name}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bulk-call-exclude-tag" className="text-xs">
                Skip contacts with tag (manual do-not-call)
              </Label>
              <select
                id="bulk-call-exclude-tag"
                value={excludeTag}
                onChange={(e) => setExcludeTag(e.target.value)}
                className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">None</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Will be called</span>
              <span className="font-mono font-semibold">
                {preview.recipients}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Skipped (opted out / no valid phone)</span>
              <span className="font-mono">{preview.skipped}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Suppressed (tag / recently called)</span>
              <span className="font-mono">{preview.suppressed}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Total matching</span>
              <span className="font-mono">{preview.matching}</span>
            </div>
            {excludeCampaignId && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Prior-campaign exclusion is applied when you launch (not shown
                in this preview).
              </p>
            )}
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={consentAck}
              onChange={(e) => setConsentAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer"
            />
            <span>
              I confirm every contact in this audience has consented to receive
              calls, and that calling them complies with the rules where they
              are.
            </span>
          </label>

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
                  Starting…
                </>
              ) : (
                <>
                  <PhoneOutgoing className="mr-1 h-4 w-4" />
                  Call {preview.recipients}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
