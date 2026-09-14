"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { AgencyBillingSection } from "@/components/agency/agency-billing-section";
import { Button } from "@/components/ui/button";

export default function AgencyBillingPage() {
  const { agencyRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border bg-card" />
      </div>
    );
  }

  if (agencyRole !== "owner") {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold">Billing is managed by your agency owner</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask the agency owner to review the plan, add-ons, or recurring charges.
        </p>
        <Button variant="outline" size="sm" render={<Link href="/me/settings" />} className="mt-4">
          Your account
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Review this agency&apos;s plan, every active add-on, and the next recurring charge.
        </p>
      </div>
      <AgencyBillingSection detailed />
    </div>
  );
}
