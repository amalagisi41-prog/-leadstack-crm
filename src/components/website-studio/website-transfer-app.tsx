"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleAlert,
  Eye,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import type {
  TransferItemStatus,
  WebsiteTransferDoc,
} from "@/types/website-transfer";

const STAGES = [
  "Address",
  "Read-only scan",
  "Inventory",
  "Readiness report",
  "Live baseline",
  "Private rebuild",
  "Approval",
  "Hosting",
];
const STATUS_LABEL: Record<TransferItemStatus, string> = {
  copied: "Copied",
  needs_approval: "Needs approval",
  cannot_access: "Cannot access",
};
const STATUS_STYLE: Record<TransferItemStatus, string> = {
  copied: "bg-emerald-50 text-emerald-700",
  needs_approval: "bg-amber-50 text-amber-800",
  cannot_access: "bg-red-50 text-red-700",
};

export function WebsiteTransferApp() {
  const { subAccountId, subAccount, saPath } = useSubAccount();
  const [sourceUrl, setSourceUrl] = useState(
    subAccount?.customDomain
      ? `https://${subAccount.customDomain.replace(/^https?:\/\//, "")}`
      : ""
  );
  const [transfer, setTransfer] = useState<WebsiteTransferDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sub-accounts/${subAccountId}/website-transfer`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          transfer?: WebsiteTransferDoc | null;
        };
        if (data.transfer) {
          setTransfer(data.transfer);
          setSourceUrl(data.transfer.sourceUrl);
        } else if (subAccount?.customDomain) {
          setSourceUrl(
            `https://${subAccount.customDomain.replace(/^https?:\/\//, "")}`
          );
        }
      })
      .finally(() => setLoading(false));
  }, [subAccountId, subAccount?.customDomain]);

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceUrl }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        transfer?: WebsiteTransferDoc;
        error?: string;
      };
      if (!res.ok || !data.transfer) {
        const msg = data.error ?? "The scan could not finish.";
        setError(msg);
        toast.error(msg);
        throw new Error(msg);
      }
      setTransfer(data.transfer);
      setError(null);
      toast.success("Read-only scan complete. Your private report is ready.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "The scan could not finish.";
      setError(msg);
    } finally {
      setScanning(false);
    }
  }

  async function approve() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        transfer?: WebsiteTransferDoc;
        error?: string;
      };
      if (!res.ok || !data.transfer) {
        const msg = data.error ?? "Approval could not be saved.";
        setError(msg);
        toast.error(msg);
        throw new Error(msg);
      }
      setTransfer(data.transfer);
      setError(null);
      toast.success(
        "Private rebuild approved. Hosting and DNS guidance is now unlocked."
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Approval could not be saved.";
      setError(msg);
    } finally {
      setApproving(false);
    }
  }

  if (loading)
    return (
      <div className="text-muted-foreground flex h-52 items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading transfer
        workspace…
      </div>
    );

  if (error && !transfer)
    return (
      <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 text-red-700" />
          <div className="flex-1">
            <p className="font-semibold text-red-900">Could not load transfer workspace</p>
            <p className="text-muted-foreground mt-2 text-sm">{error}</p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => window.location.reload()}>
                Try again
              </Button>
              <Button
                variant="outline"
                render={<Link href={saPath("/website-studio")} />}
              >
                Back to website studio
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  const counts = transfer?.pages.reduce(
    (result, page) => ({ ...result, [page.status]: result[page.status] + 1 }),
    { copied: 0, needs_approval: 0, cannot_access: 0 } as Record<
      TransferItemStatus,
      number
    >
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Current Status */}
      <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">What&apos;s connected</p>
            <p className="mt-2 font-medium">
              {transfer?.sourceUrl ? (
                <>
                  <a href={transfer.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                    {transfer.sourceUrl}
                  </a>
                  <span className="text-xs text-blue-600 ml-2">✓ Verified</span>
                </>
              ) : (
                <span className="text-gray-500">No website yet</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Status</p>
            <p className="mt-2 font-medium">
              {!transfer ? (
                <span className="text-amber-700">Ready to scan</span>
              ) : transfer.baselineApprovedAt ? (
                <span className="text-emerald-700">✓ Baseline approved</span>
              ) : (
                <span className="text-amber-700">Awaiting approval</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">What&apos;s next</p>
            <p className="mt-2 text-sm font-medium">
              {!transfer ? (
                <span className="text-blue-700">Enter your website URL and run scan</span>
              ) : !transfer.baselineApprovedAt ? (
                <span className="text-blue-700">Review baseline and approve</span>
              ) : (
                <Link href={saPath("/domain?stage=cutover")} className="text-blue-700 hover:underline">
                  Prepare domain cutover →
                </Link>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#1d3f76] p-6 text-white">
        <p className="text-xs font-bold tracking-[.18em] text-pink-300">
          LIVE-SITE BASELINE + PRIVATE REBUILD
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          Review the public site first. Build privately only when it is safe.
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-blue-100">
          Enter the live address. AgentStack checks the current public pages,
          creates an isolated read-only baseline, and records your approval
          before the private Vibe build opens. Your live site, domain, email,
          forms, analytics, and DNS stay untouched.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {STAGES.map((label, index) => (
          <div
            key={label}
            className={`rounded-xl border p-2 text-center text-[11px] font-semibold ${index + 1 <= (transfer?.stage ?? 1) ? "border-blue-200 bg-blue-50 text-blue-800" : "text-muted-foreground"}`}
          >
            <span className="block text-xs">{index + 1}</span>
            {label}
          </div>
        ))}
      </div>
      <section className="rounded-2xl border p-5">
        <h2 className="font-semibold">1. Enter the live website</h2>
        {error && transfer && (
          <div className="text-red-700 border-red-200 bg-red-50 mt-3 rounded-lg border p-3 text-sm">
            <p className="font-medium">{error}</p>
            <p className="mt-1 text-xs">Try refreshing the page or contact support if the issue persists.</p>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="h-10 flex-1 rounded-lg border px-3 text-sm"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://yourwebsite.com"
          />
          <Button onClick={scan} disabled={scanning || !sourceUrl.trim()}>
            {scanning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Zack is
                scanning…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" /> Run read-only scan
              </>
            )}
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          No passwords are requested. Forms and scripts are disabled inside the
          private preview.
        </p>
      </section>
      {transfer ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                "copied",
                "needs_approval",
                "cannot_access",
              ] as TransferItemStatus[]
            ).map((status) => (
              <div key={status} className="rounded-2xl border p-4">
                <div className="flex items-center gap-2">
                  {status === "copied" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : status === "needs_approval" ? (
                    <CircleAlert className="h-5 w-5 text-amber-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-semibold">{STATUS_LABEL[status]}</span>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {counts?.[status] ?? 0}
                </p>
              </div>
            ))}
          </div>
          <section className="rounded-2xl border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Site readiness report</h2>
                <p className="text-muted-foreground text-sm">
                  Every page is checked before you start a private rebuild.
                </p>
              </div>
              {transfer.privatePreviewPath ? (
                <Button
                  variant="default"
                  render={<Link href={transfer.privatePreviewPath} />}
                >
                  <Eye className="mr-2 h-4 w-4" /> Open live baseline
                </Button>
              ) : null}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Page</th>
                    <th>Status</th>
                    <th>Images</th>
                    <th>Forms</th>
                    <th>Scripts</th>
                  </tr>
                </thead>
                <tbody>
                  {transfer.pages.map((page) => (
                    <tr key={page.url} className="border-b last:border-0">
                      <td className="max-w-md py-3">
                        <p className="truncate font-medium">{page.title}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {page.path}
                        </p>
                      </td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLE[page.status]}`}
                        >
                          {STATUS_LABEL[page.status]}
                        </span>
                      </td>
                      <td>{page.imageCount}</td>
                      <td>{page.formCount}</td>
                      <td>{page.scriptCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Inventory label="Pages" value={String(transfer.inventory.pages)} />
            <Inventory
              label="CMS"
              value={transfer.inventory.cms ?? "Needs approval"}
            />
            <Inventory
              label="Host / edge"
              value={transfer.inventory.hosting ?? "Needs approval"}
            />
            <Inventory label="Forms" value={String(transfer.inventory.forms)} />
            <Inventory
              label="Images"
              value={String(transfer.inventory.images.length)}
            />
            <Inventory
              label="Fonts"
              value={String(transfer.inventory.fonts.length)}
            />
            <Inventory
              label="Tracking tools"
              value={String(transfer.inventory.tracking.length)}
            />
            <Inventory
              label="Redirects"
              value={String(transfer.inventory.redirects.length)}
            />
          </section>
          <section className="rounded-2xl border p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-700" />
              <div className="flex-1">
                <h2 className="font-semibold">Safe approval gate</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Approve the live baseline first. The private rebuild remains
                  isolated until you review it separately. DNS and hosting
                  instructions stay locked until both checks are complete.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {transfer.status !== "approved" ? (
                    <Button onClick={approve} disabled={approving}>
                      {approving
                        ? "Saving approval…"
                        : "Approve live baseline"}
                    </Button>
                  ) : (
                    <Button
                      render={<Link href={saPath("/domain?stage=cutover")} />}
                    >
                      Open exact DNS cutover steps
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    render={
                      <a
                        href={transfer.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open live site
                      </a>
                    }
                  >
                    Open live site
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Inventory({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
