"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SubAccountProvider, useSubAccount } from "@/context/sub-account-context";
import { SetupHub } from "@/components/onboarding/setup-hub";
import { Compass } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/agency/getting-started/overview-tab";
import { FeaturesTab } from "@/components/agency/getting-started/features-tab";
import { NextStepsTab } from "@/components/agency/getting-started/next-steps-tab";

/**
 * Get Started — a real destination, not a redirect. For anyone with a
 * workspace it is the setup hub: every step of The AgentStack Method with
 * its status and a link to where each task is done (see SetupHub). Before,
 * this page silently `router.replace`d to the sub-account's Setup page,
 * which itself bounced finished workspaces to the dashboard, where the
 * setup pop-up opened — so "Get started" never showed the steps at all.
 *
 * An agency owner without a workspace yet still gets the orientation tabs.
 * `?sa=<id>` picks which workspace's setup to show when there are several.
 */
function WorkspaceSetupHub() {
  const { subAccountId, subAccount, saPath } = useSubAccount();
  return <SetupHub subAccountId={subAccountId} subAccount={subAccount} saPath={saPath} />;
}

function GetStartedContent() {
  const searchParams = useSearchParams();
  const { user, loading, agencyRole, memberships } = useAuth();
  const requested = searchParams.get("sa");
  const selected =
    memberships.find((m) => m.subAccountId === requested) ?? memberships[0] ?? null;
  const firstSubAccountId = memberships[0]?.subAccountId ?? null;
  const agency = useAgency();

  useEffect(() => {
    document.title = `Get started · ${agency.name}`;
  }, [agency.name]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-5xl rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Sign in to view this page.
      </div>
    );
  }

  if (selected) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Compass className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Get started</h1>
            <p className="text-sm text-muted-foreground">
              Every setup step for {selected.name || "your workspace"}, with where to do it.
            </p>
          </div>
        </header>
        {memberships.length > 1 ? (
          <nav className="flex flex-wrap gap-2" aria-label="Choose a workspace">
            {memberships.map((m) => (
              <Link
                key={m.subAccountId}
                href={`/agency/get-started?sa=${encodeURIComponent(m.subAccountId)}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  m.subAccountId === selected.subAccountId ? "border-primary bg-primary/5" : "hover:border-primary"
                }`}
              >
                {m.name || m.subAccountId}
              </Link>
            ))}
          </nav>
        ) : null}
        <SubAccountProvider key={selected.subAccountId} subAccountId={selected.subAccountId}>
          <WorkspaceSetupHub />
        </SubAccountProvider>
      </div>
    );
  }

  if (agencyRole !== "owner") {
    return (
      <div className="mx-auto max-w-5xl rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have a workspace yet. Ask your agency owner to invite you to one.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Compass className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Get started</h1>
          <p className="text-sm text-muted-foreground">
            A two-minute tour of {agency.name} and the agency workflow it
            supports.
          </p>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="next-steps">Next steps</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab agencyName={agency.name} />
        </TabsContent>
        <TabsContent value="features" className="mt-4">
          <FeaturesTab firstSubAccountId={firstSubAccountId} />
        </TabsContent>
        <TabsContent value="next-steps" className="mt-4">
          <NextStepsTab firstSubAccountId={firstSubAccountId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function GetStartedPage() {
  return (
    <Suspense fallback={null}>
      <GetStartedContent />
    </Suspense>
  );
}
