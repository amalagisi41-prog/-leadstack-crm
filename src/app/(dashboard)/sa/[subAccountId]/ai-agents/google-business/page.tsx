"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubAccount } from "@/context/sub-account-context";

export default function AiAgentsGoogleBusinessPage() {
  const { saPath } = useSubAccount();
  const messagingHref = `${saPath("/dashboard/settings")}?tab=messaging`;
  const reviewsHref = `${messagingHref}#google-reviews`;
  const emailHref = `${messagingHref}#business-email`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <p className="text-muted-foreground text-sm font-medium">Business connections</p>
        <h1 className="mt-1 text-2xl font-semibold">Google connections</h1>
        <p className="text-muted-foreground mt-2">
          One guided place for Google Business Profile, reviews, Workspace/Gmail, and Ads. External links open Google in a new tab; local links configure the AgentStack settings Zack and your automations use. You can always return here from onboarding or Site Health.
        </p>
      </div>
      <div className="bg-card rounded-2xl border p-6">
        <h2 className="font-semibold">Manage your Google connections</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Set up your Google Business Profile connection and configure review requests, Gmail settings, and more from within AgentStack.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button render={<Link href={saPath("/business-profile")} />}>
            Set up Business Profile
          </Button>
          <Button variant="outline" render={<Link href={reviewsHref} />}>
            Configure Google reviews
          </Button>
          <Button variant="outline" render={<Link href={emailHref} />}>
            Workspace &amp; Gmail
          </Button>
        </div>
      </div>
    </div>
  );
}
