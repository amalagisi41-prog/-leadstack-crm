"use client";

import { useEffect } from "react";
import { Compass } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/agency/getting-started/overview-tab";
import { FeaturesTab } from "@/components/agency/getting-started/features-tab";
import { NextStepsTab } from "@/components/agency/getting-started/next-steps-tab";

/**
 * Owner-aimed orientation page. Three tabs: workflow overview, feature
 * tour, recommended next steps. Static content + auth context only — no
 * API calls.
 */
export default function GetStartedPage() {
  const { user, loading, agencyRole, memberships } = useAuth();
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

  if (agencyRole !== "owner") {
    return (
      <div className="mx-auto max-w-5xl rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Only the agency owner can view this orientation page.
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
