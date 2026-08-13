"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { GhlImportWizard } from "@/components/import/ghl-import-wizard";

/**
 * GoHighLevel migration importer. Reached from Settings → Admin. The wizard
 * walks connect → review mapping → run, streaming live progress.
 */
export default function ImportPage() {
  const { saPath } = useSubAccount();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={saPath("/connect")}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Connections
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Migrate from GoHighLevel
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bring your contacts (with custom fields + tags), opportunities, and
          notes across. Re-running is safe — records update instead of
          duplicating. Smart Workflows, funnels, and page designs can&apos;t be
          exported from GoHighLevel and are rebuilt here.
        </p>
      </header>
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          "Connect your GHL location",
          "Review fields and pipeline",
          "Import and verify",
        ].map((label, index) => (
          <div
            key={label}
            className="bg-card flex items-center gap-2 rounded-xl border p-3 text-xs font-medium"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#173B7A] text-[11px] font-semibold text-white">
              {index + 1}
            </span>
            {label}
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" /> Safe to run more than once
        </p>
        <p className="mt-1">
          AgentStack updates previously imported records instead of creating
          duplicates. Your GHL account remains unchanged.
        </p>
      </div>
      <GhlImportWizard />
    </div>
  );
}
