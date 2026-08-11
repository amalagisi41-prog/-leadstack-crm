"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { useAgency } from "@/hooks/use-agency";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";

export function BrokerFeatureOnly({ children }: { children: React.ReactNode }) {
  const agency = useAgency();
  const { saPath } = useSubAccount();

  if (agency.loading) {
    return <div className="bg-muted/30 h-64 animate-pulse rounded-2xl" />;
  }

  if (agency.multiAccountModeEnabled) return children;

  return (
    <div className="bg-card mx-auto max-w-xl rounded-2xl border p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-700">
        <Building2 className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">Broker-level feature</h1>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        Quotes, invoices, products, and client payment documents are not part of
        AgentStack Solo. They are available only in broker workspaces.
      </p>
      <Button className="mt-5" render={<Link href={saPath("/dashboard")} />}>
        Return to Today
      </Button>
    </div>
  );
}
