"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
        href={saPath("/dashboard/settings")}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to settings
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Migrate from GoHighLevel
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bring your contacts (with custom fields + tags), opportunities, and
          notes across. Re-running is safe — records update instead of
          duplicating. Workflows, funnels, and page designs can&apos;t be
          exported from GoHighLevel and are rebuilt here.
        </p>
      </header>
      <GhlImportWizard />
    </div>
  );
}
