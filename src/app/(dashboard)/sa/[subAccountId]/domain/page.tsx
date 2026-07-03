"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { DomainConnect } from "@/components/dashboard/domain-connect";

export default function DomainPage() {
  const { saPath } = useSubAccount();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" render={<Link href={saPath("/get-started")} />}>
        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to setup
      </Button>
      <DomainConnect />
    </div>
  );
}
