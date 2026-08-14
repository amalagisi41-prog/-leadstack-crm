"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import type { WebsiteTransferDoc } from "@/types/website-transfer";

export default function WebsiteTransferPreviewPage() {
  const { subAccountId, saPath } = useSubAccount();
  const [transfer, setTransfer] = useState<WebsiteTransferDoc | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    fetch(`/api/sub-accounts/${subAccountId}/website-transfer`)
      .then((res) => res.json())
      .then((data) => setTransfer(data.transfer ?? null));
  }, [subAccountId]);
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
  const selected = transfer.pages[page];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Private page comparison</h1>
          <p className="text-muted-foreground text-sm">
            Original on the left. Safe read-only snapshot on the right.
          </p>
        </div>
        <Button
          variant="outline"
          render={<Link href={saPath("/website-studio?mode=replacement")} />}
        >
          Back to report
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {transfer.pages.map((item, index) => (
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Frame title="Original live page" src={selected.url} />
          <Frame
            title="Private safe snapshot"
            src={`/api/sub-accounts/${subAccountId}/website-transfer/preview?page=${page}`}
          />
        </div>
      ) : null}
    </div>
  );
}

function Frame({ title, src }: { title: string; src: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      <div className="bg-muted px-4 py-2 text-xs font-semibold">{title}</div>
      <iframe
        title={title}
        src={src}
        className="h-[70vh] w-full bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}
