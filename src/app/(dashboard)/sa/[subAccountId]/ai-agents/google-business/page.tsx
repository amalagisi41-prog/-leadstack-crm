"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubAccount } from "@/context/sub-account-context";

export default function AiAgentsGoogleBusinessPage() {
  const { saPath } = useSubAccount();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <p className="text-muted-foreground text-sm font-medium">AI channel</p>
        <h1 className="mt-1 text-2xl font-semibold">Google Business Profile</h1>
        <p className="text-muted-foreground mt-2">
          Manage the profile in Google, then save its public link in your Business Blueprint so Zack and your website workflows can reference it.
        </p>
      </div>
      <div className="bg-card rounded-2xl border p-6">
        <h2 className="font-semibold">Connect your profile</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Open Google Business Profile to manage reviews and updates. Return to AgentStack and add the public profile URL to your Blueprint.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button render={<a href="https://business.google.com/" target="_blank" rel="noreferrer" />}>
            Open Google Business Profile <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" render={<Link href={saPath("/business-profile")} />}>
            Open Business Blueprint
          </Button>
        </div>
      </div>
    </div>
  );
}
