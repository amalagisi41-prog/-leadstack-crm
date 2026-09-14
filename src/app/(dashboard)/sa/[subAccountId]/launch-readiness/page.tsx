"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, ClipboardCheck, HelpCircle } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { evaluateLaunchAcceptance, type AcceptanceCheck } from "@/lib/launch/acceptance";
import type { CampaignChannel, CampaignBriefDoc } from "@/types/marketing-campaigns";
import { toDate } from "@/lib/format";

interface CampaignResponse {
  briefs?: CampaignBriefDoc[];
  channelAvailability?: Partial<Record<CampaignChannel, { configured: boolean; publishable: boolean }>>;
}

const CHANNELS: CampaignChannel[] = ["facebook", "instagram", "googleBusiness"];

function StatusIcon({ status }: { status: AcceptanceCheck["status"] }) {
  if (status === "passed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "blocked") return <AlertCircle className="h-4 w-4 text-amber-600" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

export default function LaunchReadinessPage() {
  const { subAccount, subAccountId, saPath } = useSubAccount();
  const searchParams = useSearchParams();
  const priority = searchParams.get("priority");
  const [checks, setChecks] = useState<AcceptanceCheck[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/sub-accounts/${subAccountId}/marketing/campaigns`)
      .then(async (response) => {
        if (!response.ok) throw new Error("campaign status unavailable");
        return (await response.json()) as CampaignResponse;
      })
      .then((data) => {
        if (!active) return;
        const brief = data.briefs?.[0];
        const approved = brief?.approvedChannels ?? [];
        const scheduled = approved.some((channel) => Boolean(brief?.schedulePlan?.[channel]));
        const idx = subAccount?.idxConfig;
        const lastSync = toDate(idx?.lastSyncAt)?.toISOString() ?? null;
        setChecks(
          evaluateLaunchAcceptance({
            idx: {
              connected: idx?.connected === true,
              listingsSynced: idx?.connected === true ? idx.listingCount : null,
              lastSyncAt: lastSync,
            },
            listingCreated: Boolean(brief),
            campaignGenerated: Boolean(brief?.brief?.channels?.length),
            approved: approved.length > 0,
            scheduled,
            publishing: data.channelAvailability ?? {},
            requestedChannels: CHANNELS,
          }).checks
        );
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [subAccountId, subAccount]);

  const passed =
    checks !== null &&
    checks.length > 0 &&
    checks.every((check) => check.status === "passed");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-primary">
          <ClipboardCheck className="h-5 w-5" />
          <p className="text-xs font-semibold tracking-[0.2em] uppercase">Set up your business</p>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Launch readiness</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          A plain-language check of the evidence AgentStack can currently see. A missing provider response is shown as not verified—not assumed to be connected.
        </p>
      </div>

      {priority && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm dark:border-blue-800 dark:bg-blue-950/30">
          <p className="font-medium">Your selected priority: {priorityLabel(priority)}</p>
          <p className="text-muted-foreground mt-1">
            Resolve the named launch items first. The checklist keeps the next
            step visible so you can return to your chosen work without guessing.
          </p>
        </section>
      )}

      {error ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          We couldn&apos;t load campaign evidence right now. Reload this page before treating any provider as ready.
        </section>
      ) : !checks ? (
        <section className="rounded-2xl border p-5 text-sm text-muted-foreground">Checking your launch evidence…</section>
      ) : (
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="font-semibold">Acceptance checklist</h2>
              <p className="text-muted-foreground mt-1 text-xs">{passed ? "Every requested check has evidence." : "Complete the unresolved items before launch."}</p>
            </div>
            <span className={passed ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700" : "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"}>
              {passed ? "Ready" : "Needs attention"}
            </span>
          </div>
          <ul className="divide-y">
            {checks.map((check) => (
              <li key={check.id} className="flex items-start gap-3 py-4">
                <StatusIcon status={check.status} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{check.label}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{check.detail}</p>
                </div>
                <span className="ml-auto shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {check.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button render={<Link href={saPath("/connect")} />}>Open Connections</Button>
        <Button variant="outline" render={<Link href={saPath("/marketing/campaigns")} />}>Open Campaigns</Button>
      </div>
    </div>
  );
}

function priorityLabel(value: string) {
  return (
    {
      get_leads: "Get more leads",
      organize_database: "Organize my database",
      build_website: "Build my website",
      ai_followup: "Set up AI follow-up",
    } as Record<string, string>
  )[value] ?? value.replaceAll("_", " ");
}
