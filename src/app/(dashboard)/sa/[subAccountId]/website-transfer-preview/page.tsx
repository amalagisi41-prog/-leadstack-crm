"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MessageSquareWarning,
  Monitor,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { openAskAssistant } from "@/components/dashboard/ask-assistant-panel";
import type { WebsiteTransferDoc } from "@/types/website-transfer";

export default function WebsiteTransferPreviewPage() {
  const { subAccountId, saPath } = useSubAccount();
  const router = useRouter();
  const [transfer, setTransfer] = useState<WebsiteTransferDoc | null>(null);
  const [page, setPage] = useState(0);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [approving, setApproving] = useState(false);
  useEffect(() => {
    fetch(`/api/sub-accounts/${subAccountId}/website-transfer`)
      .then((res) => res.json())
      .then((data) => setTransfer(data.transfer ?? null));
  }, [subAccountId]);
  const uniquePages = useMemo(() => {
    const seen = new Set<string>();
    return (transfer?.pages ?? [])
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (seen.has(item.path)) return false;
        seen.add(item.path);
        return true;
      });
  }, [transfer?.pages]);
  if (!transfer)
    return (
      <p className="text-muted-foreground p-6">Loading private comparison…</p>
    );
  if ((transfer.snapshotVersion ?? 1) < 2)
    return (
      <div className="bg-card mx-auto max-w-2xl rounded-2xl border p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">Refresh the visual copy</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The comparison engine has been upgraded to retain each page&apos;s
          layout, styles, images, and responsive presentation. Run the read-only
          scan once more to replace this older text-only snapshot.
        </p>
        <Button
          className="mt-5"
          render={<Link href={saPath("/website-studio?mode=replacement")} />}
        >
          Back to report and refresh scan
        </Button>
      </div>
    );
  const selectedEntry = uniquePages[page];
  const selected = selectedEntry?.item;
  const sourceIndex = selectedEntry?.index ?? 0;

  async function approveReplacement() {
    setApproving(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        transfer?: WebsiteTransferDoc;
        error?: string;
      };
      if (!response.ok || !data.transfer)
        throw new Error(data.error ?? "Approval could not be saved.");
      setTransfer(data.transfer);
      toast.success("Replacement approved. DNS cutover guidance is unlocked.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Approval could not be saved."
      );
    } finally {
      setApproving(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Private page comparison</h1>
          <p className="text-muted-foreground text-sm">
            Original on the left. Private coded replacement on the right.
          </p>
        </div>
        <Button
          variant="outline"
          render={<Link href={saPath("/website-studio?mode=replacement")} />}
        >
          Back to report
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3">
        <div>
          <p className="text-sm font-semibold">Review the coded replacement</p>
          <p className="text-muted-foreground text-xs">
            Matching visuals are expected. Forms, scripts, analytics, and live
            data remain isolated until approval.
          </p>
        </div>
        <div className="flex rounded-lg border bg-white p-1">
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${device === "desktop" ? "bg-[#1d3f76] text-white" : "text-slate-600"}`}
          >
            <Monitor className="h-3.5 w-3.5" /> Desktop
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${device === "mobile" ? "bg-[#1d3f76] text-white" : "text-slate-600"}`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Mobile
          </button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          "Choose each page and compare the layout",
          "Check both desktop and mobile views",
          "Report differences or approve the replacement",
        ].map((instruction, index) => (
          <div
            key={instruction}
            className="flex items-center gap-2 rounded-xl border bg-white p-3 text-xs font-medium"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-[#1d3f76]">
              {index + 1}
            </span>
            {instruction}
          </div>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {uniquePages.map(({ item }, index) => (
          <button
            key={item.url}
            onClick={() => setPage(index)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap ${index === page ? "bg-[#1d3f76] text-white" : "bg-card"}`}
          >
            {item.path}
          </button>
        ))}
      </div>
      {selected ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Frame
              title="Original page (captured from live site)"
              src={`/api/sub-accounts/${subAccountId}/website-transfer/preview?page=${sourceIndex}`}
              device={device}
              status="Read-only source capture"
            />
            <Frame
              title="Private coded replacement"
              src={`/api/sub-accounts/${subAccountId}/website-transfer/replacement?page=${sourceIndex}`}
              device={device}
              status={
                selected.status === "needs_approval"
                  ? "Interactive items need approval"
                  : "Visual copy ready"
              }
            />
          </div>
          <section className="sticky bottom-4 z-10 flex flex-col gap-4 rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">What happens next?</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Report anything that looks wrong. Approve only when the private
                replacement matches across the pages and device sizes you
                reviewed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  openAskAssistant({
                    prompt: `Audit the website replacement for ${selected.path}. Help me describe and fix any visual, content, mobile, form, SEO, or compliance differences before approval.`,
                  })
                }
              >
                <MessageSquareWarning className="mr-2 h-4 w-4" /> Report a
                difference to Zack
              </Button>
              {transfer.status === "approved" ? (
                <Button
                  type="button"
                  onClick={() => router.push(saPath("/domain?stage=cutover"))}
                >
                  Continue to hosting &amp; DNS readiness
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={approveReplacement} disabled={approving}>
                  {approving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Approve replacement
                </Button>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Frame({
  title,
  src,
  device,
  status,
}: {
  title: string;
  src: string;
  device: "desktop" | "mobile";
  status?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      <div className="bg-muted flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold">
        <span>{title}</span>
        {status ? (
          <span className="rounded-full bg-white px-2 py-1 text-[10px] text-slate-600">
            {status}
          </span>
        ) : null}
      </div>
      <div className="overflow-auto bg-slate-100 p-2">
        <iframe
          title={title}
          src={src}
          className={`mx-auto h-[70vh] bg-white shadow-sm transition-[width] ${device === "mobile" ? "w-[390px] max-w-full" : "w-full"}`}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
