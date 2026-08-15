"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSubAccount } from "@/context/sub-account-context";
import type { WebsiteTransferDoc } from "@/types/website-transfer";

export function ExactTransferStudio({
  transfer,
}: {
  transfer: WebsiteTransferDoc;
}) {
  const { subAccountId, saPath } = useSubAccount();
  const [page, setPage] = useState(0);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [approving, setApproving] = useState(false);
  const [baselineState, setBaselineState] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const uniquePages = useMemo(() => {
    const seen = new Set<string>();
    return transfer.pages
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (seen.has(item.path)) return false;
        seen.add(item.path);
        return true;
      });
  }, [transfer.pages]);
  const [iframeHeight, setIframeHeight] = useState(900);
  const selectedEntry = uniquePages[page];
  const selected = selectedEntry?.item;
  const sourceIndex = selectedEntry?.index ?? 0;
  const previewSrc = `/api/sub-accounts/${subAccountId}/website-transfer/preview?page=${sourceIndex}&live=1`;

  useEffect(() => {
    let cancelled = false;
    setBaselineState("checking");
    void fetch(previewSrc, { cache: "no-store" })
      .then((response) => {
        if (cancelled) return;
        const mode = response.headers.get("x-agentstack-preview-mode");
        setBaselineState(
          response.ok && mode === "live-baseline" ? "ready" : "unavailable"
        );
      })
      .catch(() => {
        if (!cancelled) setBaselineState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [previewSrc]);

  useEffect(() => {
    const iframe = document.querySelector(
      'iframe[title*="Live source"]'
    ) as HTMLIFrameElement | null;
    if (!iframe) return;

    const updateHeight = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc?.documentElement) {
          const height = Math.max(
            doc.documentElement.scrollHeight,
            doc.body.scrollHeight,
            600
          );
          setIframeHeight(Math.min(height, 2000));
        }
      } catch {
        // Cross-origin or not yet loaded
      }
    };

    const timer = setTimeout(updateHeight, 500);
    iframe.addEventListener("load", updateHeight);
    window.addEventListener("resize", updateHeight);

    return () => {
      clearTimeout(timer);
      iframe.removeEventListener("load", updateHeight);
      window.removeEventListener("resize", updateHeight);
    };
  }, [previewSrc]);

  async function approveBaseline() {
    setApproving(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve_live_baseline" }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        transfer?: WebsiteTransferDoc;
        error?: string;
      };
      if (!response.ok || !data.transfer)
        throw new Error(data.error ?? "Approval could not be saved.");
      toast.success("Live baseline approved. Opening Website Vibe Studio.");
      window.location.href = saPath("/website-studio/vibe");
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
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <p className="font-semibold text-blue-950">Live-site baseline preview · read-only</p>
            <p className="mt-1 max-w-3xl text-sm text-blue-900/75">
              Review the current public website first. This read-only view does
              not publish, replace, or connect anything. Website Vibe Studio
              remains locked until you approve this baseline.
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3">
        <div>
            <p className="text-sm font-semibold">Current live website</p>
            <p className="text-muted-foreground text-xs">
              Choose a page and check desktop and mobile rendering before starting
              the connected Vibe build.
            </p>
            <p className="mt-1 text-xs font-semibold">
              {baselineState === "checking"
                ? "Checking live source…"
                : baselineState === "ready"
                  ? "Live source verified · scripts isolated · nothing published"
                  : "Live source unavailable · refresh before approving"}
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

      <div className="flex gap-2 overflow-x-auto pb-1">
        {uniquePages.map(({ item }, index) => (
          <button
            key={item.url}
            type="button"
            onClick={() => setPage(index)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap ${index === page ? "bg-[#1d3f76] text-white" : "bg-card"}`}
          >
            {item.path}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="overflow-hidden rounded-2xl border">
          <div className="bg-muted px-4 py-2 text-xs font-semibold">
            Live source · {selected.path}
          </div>
          <div className="overflow-auto bg-slate-100 p-2">
            <iframe
              title={`Live source ${selected.path}`}
              src={previewSrc}
              frameBorder="0"
              className={`mx-auto bg-white shadow-sm transition-[width,height] ${device === "mobile" ? "w-[390px] max-w-full" : "w-full"}`}
              style={{
                display: "block",
                minHeight: "600px",
                height: `${iframeHeight}px`,
                border: "none",
                borderRadius: "8px"
              }}
            />
          </div>
        </div>
      ) : null}

      <section className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Approve the live baseline</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Approval opens the connected Website Vibe Studio. Nothing is
            published until you approve a later build.
          </p>
        </div>
        <Button
          onClick={approveBaseline}
          disabled={
            approving ||
            Boolean(transfer.baselineApprovedAt) ||
            baselineState !== "ready"
          }
        >
          {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {transfer.baselineApprovedAt
            ? "Live baseline approved"
            : "Approve live baseline"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </section>
    </div>
  );
}
