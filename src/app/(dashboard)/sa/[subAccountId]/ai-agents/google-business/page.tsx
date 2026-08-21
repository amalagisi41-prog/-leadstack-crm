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
        <p className="text-muted-foreground text-sm font-medium">AI channel</p>
        <h1 className="mt-1 text-2xl font-semibold">Google Business Profile</h1>
        <p className="text-muted-foreground mt-2">
          Keep your Google connection available throughout onboarding. Manage your profile, reviews, and Workspace/Gmail settings in Google, then save the public profile link in your Business Blueprint so Zack and your website workflows can reference it.
        </p>
      </div>
      <div className="bg-card rounded-2xl border p-6">
        <h2 className="font-semibold">Connect your profile</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Open Google Business Profile to manage profile updates and reviews. Return to AgentStack to configure review requests, Workspace/Gmail, and the public profile URL without losing this connection.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button render={<a href="https://business.google.com/" target="_blank" rel="noreferrer" />}>
            Open Google Business Profile <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" render={<Link href={saPath("/business-profile")} />}>
            Open Business Blueprint
          </Button>
          <Button variant="outline" render={<Link href={reviewsHref} />}>
            Configure Google reviews
          </Button>
          <Button variant="ghost" render={<Link href={emailHref} />}>
            Workspace &amp; Gmail
          </Button>
        </div>
      </div>
    </div>
  );
}
