"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Monitor, Smartphone } from "lucide-react";
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
  const selectedEntry = uniquePages[page];
  const selected = selectedEntry?.item;
  const sourceIndex = selectedEntry?.index ?? 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-950">
                Imported exact design
              </p>
              <p className="mt-1 max-w-3xl text-sm text-emerald-900/75">
                This is the captured replacement—not an AgentStack template. Its
                page HTML, CSS, fonts, colors, images, layout, and responsive
                rules remain attached to the imported pages.
              </p>
            </div>
          </div>
          <Button render={<Link href={saPath("/website-transfer-preview")} />}>
            Open full comparison
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3">
        <div>
          <p className="text-sm font-semibold">Original and imported code</p>
          <p className="text-muted-foreground text-xs">
            Choose every page and verify desktop and mobile before hosting.
            Forms, analytics, and third-party scripts stay isolated until their
            connections are approved.
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
        <div className="grid gap-4 lg:grid-cols-2">
          <TransferFrame
            title="Original live page"
            src={selected.url}
            device={device}
          />
          <TransferFrame
            title="Imported exact replacement"
            src={`/api/sub-accounts/${subAccountId}/website-transfer/replacement?page=${sourceIndex}`}
            device={device}
          />
        </div>
      ) : null}

      <section className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Exact-design workflow</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Use the comparison to report differences. Continue only with this
            imported replacement; Luxe, Coastal, and Metro are separate optional
            redesigns.
          </p>
        </div>
        <Button
          render={
            <Link
              href={
                transfer.status === "approved"
                  ? saPath("/domain?stage=cutover")
                  : saPath("/website-transfer-preview")
              }
            />
          }
        >
          {transfer.status === "approved"
            ? "Continue imported site to hosting"
            : "Review and approve imported site"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </section>
    </div>
  );
}

function TransferFrame({
  title,
  src,
  device,
}: {
  title: string;
  src: string;
  device: "desktop" | "mobile";
}) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      <div className="bg-muted px-4 py-2 text-xs font-semibold">{title}</div>
      <div className="overflow-auto bg-slate-100 p-2">
        <iframe
          title={title}
          src={src}
          className={`mx-auto h-[70vh] bg-white shadow-sm transition-[width] ${device === "mobile" ? "w-[390px] max-w-full" : "w-full"}`}
        />
      </div>
    </div>
  );
}
