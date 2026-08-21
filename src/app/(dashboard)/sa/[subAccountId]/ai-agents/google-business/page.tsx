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
        <h2 className="font-semibold">Choose what to manage</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Keep your public profile link and review-request settings in sync with your verified Google account. Nothing here replaces your Google login or guesses business details.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button render={<a href="https://business.google.com/" target="_blank" rel="noreferrer" />}>
            Open Google Business Profile <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" render={<Link href={saPath("/business-profile")} />}>
            Edit Business Blueprint
          </Button>
          <Button variant="outline" render={<Link href={reviewsHref} />}>
            Configure Google reviews
          </Button>
          <Button variant="ghost" render={<Link href={emailHref} />}>
            Workspace &amp; Gmail
          </Button>
          <Button
            variant="ghost"
            render={<a href="https://ads.google.com/" target="_blank" rel="noreferrer" />}
          >
            Google Ads <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
