"use client";

import { useState } from "react";
import { History, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AgentSiteDoc, AgentSiteRevision } from "@/types/agent-site";

function revisionDate(value: unknown) {
  if (!value || typeof value !== "object") return "Just now";
  const seconds =
    "_seconds" in value && typeof value._seconds === "number"
      ? value._seconds
      : "seconds" in value && typeof value.seconds === "number"
        ? value.seconds
        : null;
  return seconds ? new Date(seconds * 1000).toLocaleString() : "Saved revision";
}

export function SiteRevisionHistory({
  subAccountId,
  onRestore,
}: {
  subAccountId: string;
  onRestore: (site: AgentSiteDoc) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<AgentSiteRevision[]>([]);

  async function load() {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/agent-site/revisions`
      );
      const data = (await res.json().catch(() => ({}))) as {
        revisions?: AgentSiteRevision[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not load revisions.");
      setRevisions(data.revisions ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load revisions."
      );
    } finally {
      setLoading(false);
    }
  }

  async function restore(revisionId: string) {
    setRestoring(revisionId);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/agent-site/revisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revisionId }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        site?: AgentSiteDoc;
        error?: string;
      };
      if (!res.ok || !data.site) {
        throw new Error(data.error ?? "Could not restore revision.");
      }
      onRestore(data.site);
      setOpen(false);
      toast.success("Revision restored as a draft.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not restore revision."
      );
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={load}>
        <History className="mr-1 h-3.5 w-3.5" /> Revisions
      </Button>
      {open ? (
        <div className="bg-card absolute top-11 right-0 z-50 w-[min(92vw,380px)] rounded-xl border p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Saved revisions</div>
              <div className="text-muted-foreground text-xs">
                Restores create a backup and always return to draft.
              </div>
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground rounded p-1"
              onClick={() => setOpen(false)}
              aria-label="Close revisions"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {loading ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading revisions…
              </div>
            ) : revisions.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Revisions appear after your next saved change.
              </p>
            ) : (
              revisions.map((revision) => (
                <div key={revision.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {revision.label}
                      </div>
                      <div className="text-muted-foreground mt-0.5 text-xs capitalize">
                        {revision.source} · {revisionDate(revision.createdAt)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restoring === revision.id}
                      onClick={() => restore(revision.id)}
                    >
                      {restoring === revision.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
