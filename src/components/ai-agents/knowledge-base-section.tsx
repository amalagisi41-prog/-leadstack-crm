"use client";

import { useEffect, useState, type FormEvent } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { toast } from "sonner";
import {
  BookOpen,
  Globe,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCcw,
  Trash2,
  Type as TypeIcon,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/format";
import { DEFAULT_MAX_CRAWL_PAGES } from "@/types/knowledge-base";
import type {
  KnowledgeSourceDoc,
  KnowledgeSourceType,
} from "@/types/knowledge-base";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

const TYPE_OPTIONS: {
  id: KnowledgeSourceType;
  label: string;
  icon: typeof Globe;
  hint: string;
}[] = [
  { id: "url", label: "Webpage or PDF", icon: Globe, hint: "One page or document URL — Firecrawl reads PDFs directly." },
  { id: "crawl", label: "Crawl a site", icon: BookOpen, hint: "Crawls up to a page limit starting from this URL." },
  { id: "qa", label: "Manual Q&A", icon: MessageSquareText, hint: "One question the agent can answer verbatim." },
  { id: "text", label: "Paste text", icon: TypeIcon, hint: "For anything not hosted at a public URL." },
];

type Source = KnowledgeSourceDoc & { id: string };

/**
 * AI Agent Knowledge Base — multi-source, retrieval-backed. Replaces the
 * old single Website URL field: operators add any number of sources
 * (webpages/PDFs, multi-page crawls, manual Q&A, pasted text), each
 * ingested in the background (chunked + embedded) and retrieved
 * per-message rather than stuffed whole into every prompt — see
 * lib/knowledge-base/retrieve.ts.
 */
export function KnowledgeBaseSection() {
  const { subAccountId, isAdmin } = useSubAccount();
  const [sources, setSources] = useState<Source[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const db = getFirebaseDb();
    const q = query(
      collection(db, `subAccounts/${subAccountId}/knowledgeBase`),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSources(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Source),
        );
        setHydrated(true);
      },
      () => setHydrated(true),
    );
    return () => unsub();
  }, [subAccountId, isAdmin]);

  async function handleResync(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/knowledge-base/sources/${id}/resync`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't re-sync.");
      toast.success("Re-syncing…");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't re-sync.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(id: string, label: string) {
    if (!confirm(`Remove "${label}" from the knowledge base?`)) return;
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/knowledge-base/sources/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Couldn't remove source.");
      toast.success("Source removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove source.");
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) return null;

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <BookOpen className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Knowledge base</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add sources — webpages, documents, crawled sites, manual
              answers. The agent pulls in only what&rsquo;s relevant to
              each message, so you can add as much as you need.
            </p>
          </div>
        </div>
        <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add source
        </Button>
      </div>

      {!hydrated ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No sources yet. Add a webpage, a PDF link, or a manual Q&A to get
          started.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {sources.map((s) => {
            const typeInfo = TYPE_OPTIONS.find((t) => t.id === s.type);
            const Icon = typeInfo?.icon ?? Globe;
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {typeInfo?.label}
                      {s.status === "ready" && (
                        <>
                          {" · "}
                          {s.chunkCount} chunk{s.chunkCount === 1 ? "" : "s"}
                          {s.lastSyncedAt && (
                            <> · synced {formatRelativeTime(s.lastSyncedAt)}</>
                          )}
                        </>
                      )}
                      {s.status === "failed" && s.errorMessage && (
                        <span className="text-destructive"> · {s.errorMessage}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[s.status]}`}
                  >
                    {(s.status === "pending" || s.status === "processing") && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {s.status}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={busyId === s.id}
                    onClick={() => void handleResync(s.id)}
                    title="Re-sync"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={busyId === s.id}
                    onClick={() => void handleRemove(s.id, s.label)}
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddSourceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        subAccountId={subAccountId}
      />
    </section>
  );
}

function AddSourceDialog({
  open,
  onOpenChange,
  subAccountId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subAccountId: string;
}) {
  const [type, setType] = useState<KnowledgeSourceType>("url");
  const [label, setLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [crawlUrl, setCrawlUrl] = useState("");
  const [maxPages, setMaxPages] = useState(DEFAULT_MAX_CRAWL_PAGES);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [rawText, setRawText] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setType("url");
    setLabel("");
    setSourceUrl("");
    setCrawlUrl("");
    setMaxPages(DEFAULT_MAX_CRAWL_PAGES);
    setQuestion("");
    setAnswer("");
    setRawText("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { type, label };
      if (type === "url") body.sourceUrl = sourceUrl;
      if (type === "crawl") {
        body.crawlUrl = crawlUrl;
        body.maxPages = maxPages;
      }
      if (type === "qa") {
        body.question = question;
        body.answer = answer;
      }
      if (type === "text") body.rawText = rawText;

      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/knowledge-base/sources`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't add source.");
      toast.success("Source added — ingesting in the background.");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add source.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a knowledge source</DialogTitle>
          <DialogDescription>
            Ingested in the background — the agent uses it once status
            flips to ready.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                  type === t.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent"
                }`}
              >
                <t.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="block font-medium">{t.label}</span>
                  <span className="text-muted-foreground">{t.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kb-label">Label</Label>
            <Input
              id="kb-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Pricing FAQ"
              required
            />
          </div>

          {type === "url" && (
            <div className="space-y-1.5">
              <Label htmlFor="kb-url">Page or PDF URL</Label>
              <Input
                id="kb-url"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com/faq"
                required
              />
            </div>
          )}

          {type === "crawl" && (
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kb-crawl-url">Site URL</Label>
                <Input
                  id="kb-crawl-url"
                  type="url"
                  value={crawlUrl}
                  onChange={(e) => setCrawlUrl(e.target.value)}
                  placeholder="https://example.com"
                  required
                />
              </div>
              <div className="w-24 space-y-1.5">
                <Label htmlFor="kb-max-pages">Max pages</Label>
                <Input
                  id="kb-max-pages"
                  type="number"
                  min={1}
                  max={50}
                  value={maxPages}
                  onChange={(e) => setMaxPages(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {type === "qa" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="kb-question">Question</Label>
                <Input
                  id="kb-question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Do you offer weekend appointments?"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-answer">Answer</Label>
                <Textarea
                  id="kb-answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={3}
                  required
                />
              </div>
            </>
          )}

          {type === "text" && (
            <div className="space-y-1.5">
              <Label htmlFor="kb-text">Content</Label>
              <Textarea
                id="kb-text"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={6}
                placeholder="Paste a policy, script, or any reference text…"
                required
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Add source"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
