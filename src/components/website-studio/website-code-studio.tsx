"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Code2,
  Loader2,
  Monitor,
  RefreshCw,
  Send,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubAccount } from "@/context/sub-account-context";
import type { WebsiteTransferDoc } from "@/types/website-transfer";

interface Turn {
  role: "user" | "coder";
  content: string;
}

interface LibrarySnapshot {
  id: string;
  sourceUrl: string;
  title: string;
  pageCount: number;
  createdAt: string | null;
  sector: string | null;
  versionType: string;
}

const SECTOR_VERSIONS = [
  ["residential", "Residential"],
  ["luxury", "Luxury"],
  ["commercial", "Commercial"],
  ["investor", "Investor"],
  ["property_management", "Property management"],
  ["rentals", "Rentals"],
  ["new_construction", "New construction"],
  ["brokerage_team", "Brokerage / team"],
] as const;

export function WebsiteCodeStudio({
  transfer,
}: {
  transfer: WebsiteTransferDoc;
}) {
  const { subAccountId } = useSubAccount();
  const pages = useMemo(() => {
    const seen = new Set<string>();
    return transfer.pages
      .map((item, sourceIndex) => ({ item, sourceIndex }))
      .filter(({ item }) => {
        if (seen.has(item.path)) return false;
        seen.add(item.path);
        return true;
      });
  }, [transfer.pages]);
  const [selected, setSelected] = useState(0);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "coder",
      content:
        "I’m your AI Website Coder. The live-site baseline is the source of truth; this workspace is a private rebuild, not a published copy. Describe a visual, layout, or copy change and I’ll update the isolated preview.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [previewSession] = useState(() => Date.now());
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState(transfer.sourceUrl);
  const [snapshotting, setSnapshotting] = useState(false);
  const [library, setLibrary] = useState<LibrarySnapshot[]>([]);
  const [creatingSector, setCreatingSector] = useState<string | null>(null);
  const entry = pages[selected] ?? pages[0];

  useEffect(() => {
    void fetch(`/api/sub-accounts/${subAccountId}/website-transfer/library`)
      .then((response) => response.json())
      .then((data: { snapshots?: LibrarySnapshot[] }) =>
        setLibrary(data.snapshots ?? [])
      )
      .catch(() => undefined);
  }, [subAccountId]);

  async function createSnapshot() {
    const sourceUrl = snapshotUrl.trim();
    if (!sourceUrl || snapshotting) return;
    setSnapshotting(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceUrl }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        transfer?: WebsiteTransferDoc;
        error?: string;
      };
      if (!response.ok || !data.transfer)
        throw new Error(data.error ?? "Could not create the snapshot.");
      toast.success("Fresh private snapshot created.");
      window.location.reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create the snapshot."
      );
    } finally {
      setSnapshotting(false);
    }
  }

  async function createSectorVersion(sector: string) {
    if (creatingSector) return;
    setCreatingSector(sector);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer/library`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sector }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        snapshot?: LibrarySnapshot;
        error?: string;
      };
      if (!response.ok || !data.snapshot)
        throw new Error(data.error ?? "Could not create this sector version.");
      setLibrary((current) => [data.snapshot!, ...current]);
      toast.success(`${data.snapshot.title} saved.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create this sector version."
      );
    } finally {
      setCreatingSector(null);
    }
  }

  async function submit() {
    const message = input.trim();
    if (!message || loading || !entry) return;
    setInput("");
    setTurns((current) => [...current, { role: "user", content: message }]);
    setLoading(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer/designer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: entry.sourceIndex, message }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not apply edit.");
      setTurns((current) => [
        ...current,
        { role: "coder", content: data.reply ?? "Preview updated." },
      ]);
      setRevision((current) => current + 1);
    } catch (error) {
      setTurns((current) => [
        ...current,
        {
          role: "coder",
          content:
            error instanceof Error ? error.message : "Could not apply edit.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Private rebuild workspace</p>
          <p className="text-muted-foreground text-xs">
            Imported site source · edits remain private · desktop and mobile
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowSnapshot((current) => !current)}
          >
            <Camera className="mr-2 h-4 w-4" />
            Refresh reference capture
          </Button>
          <div className="flex rounded-lg border bg-white p-1">
            <button
              type="button"
              onClick={() => setDevice("desktop")}
              className={`flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold ${device === "desktop" ? "bg-[#173b7a] text-white" : ""}`}
            >
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </button>
            <button
              type="button"
              onClick={() => setDevice("mobile")}
              className={`flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold ${device === "mobile" ? "bg-[#173b7a] text-white" : ""}`}
            >
              <Smartphone className="h-3.5 w-3.5" /> Mobile
            </button>
          </div>
        </div>
      </div>
      {showSnapshot ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-sm font-semibold" htmlFor="snapshot-url">
                Website to capture
              </label>
              <p className="text-muted-foreground mb-2 text-xs">
                Creates a new private HTML/CSS snapshot and replaces the current
                workspace copy. The public website is never changed.
              </p>
              <Input
                id="snapshot-url"
                type="url"
                value={snapshotUrl}
                onChange={(event) => setSnapshotUrl(event.target.value)}
                placeholder="https://yourwebsite.com"
                disabled={snapshotting}
              />
            </div>
            <Button
              type="button"
              onClick={() => void createSnapshot()}
              disabled={snapshotting || !snapshotUrl.trim()}
            >
              {snapshotting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Capture website
            </Button>
          </div>
          <div className="mt-4 border-t border-blue-200 pt-4">
            <p className="text-sm font-semibold">Create a sector version</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Save a separate working copy of the current captured site for a
              specific real estate audience. Each version remains independent.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SECTOR_VERSIONS.map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void createSectorVersion(value)}
                  disabled={Boolean(creatingSector)}
                >
                  {creatingSector === value ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4 border-t border-blue-200 pt-4">
            <p className="text-sm font-semibold">Snapshot library</p>
            {library.length ? (
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {library.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="rounded-lg border bg-white p-3"
                  >
                    <p className="truncate text-sm font-semibold">
                      {snapshot.title}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {snapshot.sourceUrl}
                    </p>
                    <p className="text-muted-foreground mt-2 text-xs">
                      {snapshot.versionType === "sector"
                        ? "Sector version · "
                        : "Captured site · "}
                      {snapshot.pageCount} page
                      {snapshot.pageCount === 1 ? "" : "s"}
                      {snapshot.createdAt
                        ? ` · ${new Date(snapshot.createdAt).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground mt-2 text-xs">
                Capture a website to add the first saved snapshot.
              </p>
            )}
          </div>
        </section>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {pages.map(({ item }, index) => (
          <button
            key={item.url}
            type="button"
            onClick={() => setSelected(index)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap ${index === selected ? "bg-[#173b7a] text-white" : "bg-card"}`}
          >
            {item.path}
          </button>
        ))}
      </div>
      <div className="grid min-h-[72vh] gap-3 lg:grid-cols-[360px_1fr]">
        <section className="bg-card flex min-h-[560px] flex-col overflow-hidden rounded-2xl border">
          <div className="border-b p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
                <Code2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">AI Website Coder</p>
                <p className="text-muted-foreground text-[11px]">
                  Isolated layout and code edits
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {turns.map((turn, index) => (
              <div
                key={index}
                className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${turn.role === "user" ? "bg-[#173b7a] text-white" : "border bg-white"}`}
                >
                  {turn.content}
                </div>
              </div>
            ))}
            {loading ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Coding and
                refreshing preview…
              </p>
            ) : null}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="flex gap-2 border-t p-3"
          >
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Change layout, colors, fonts, spacing, or copy…"
              disabled={loading}
            />
            <Button type="submit" size="sm" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </section>
        <section className="overflow-hidden rounded-2xl border bg-slate-100">
          <div className="border-b bg-white px-4 py-2 text-xs font-semibold">
            Real-time private preview · {entry?.item.path ?? "/"}
          </div>
          <div className="h-[72vh] overflow-auto p-2">
            {entry ? (
              <iframe
                key={`${entry.sourceIndex}-${revision}`}
                title="Private coded website preview"
                src={`/api/sub-accounts/${subAccountId}/website-transfer/replacement?page=${entry.sourceIndex}&revision=${revision}&session=${previewSession}`}
                onLoad={(event) => {
                  event.currentTarget.contentWindow?.scrollTo(0, 0);
                }}
                className={`mx-auto h-full bg-white shadow ${device === "mobile" ? "w-[390px] max-w-full" : "w-full"}`}
                sandbox="allow-same-origin"
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
