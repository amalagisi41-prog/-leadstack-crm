"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { DomainConnect } from "@/components/dashboard/domain-connect";

export default function DomainPage() {
  const { saPath } = useSubAccount();
  const searchParams = useSearchParams();
  const isCutover = searchParams.get("stage") === "cutover";
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {!isCutover ? (
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={saPath("/connect")} />}
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Connections
        </Button>
      ) : null}
      <DomainConnect />
    </div>
  );
}
