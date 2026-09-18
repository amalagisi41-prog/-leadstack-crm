"use client";

import Link from "next/link";
import { ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { buildRprHomeUrl, buildRprPropertyUrl } from "@/lib/rpr/link";

/**
 * "View on RPR" — opens this property inside the agent's own RPR (Realtors
 * Property Resource) account, through their MLS sign-in.
 *
 * It used to open RPR's home page and tell the agent to paste the address
 * into RPR's search box, on the belief that RPR could not be linked to a
 * specific property from outside. That was wrong: RPR publishes a deep-link
 * endpoint that takes an MLS listing number or a full address and resolves
 * its own internal property id from either. Verified against a live signed-in
 * RPR session on both paths — see src/lib/rpr/link.ts.
 *
 * It also used to copy the address to the clipboard, as a hedge while the
 * destination was unconfirmed. That hedge is retired: clobbering whatever
 * the agent had copied is a real cost, and it bought nothing once the link
 * was shown to land on the property.
 *
 * Locked (not hidden) when the sub-account hasn't set an RPR org code yet —
 * names what's missing and links straight to where it's fixed, per the
 * "no guessing" onboarding standard.
 */
export function RprLinkButton({
  address,
  city,
  state,
  zip,
  mlsId,
}: {
  address: string;
  city: string;
  state: string;
  zip?: string | null;
  mlsId?: string | null;
}) {
  const { subAccount, isAdmin, saPath } = useSubAccount();
  const rprOrgId = subAccount?.rprOrgId ?? null;

  if (!rprOrgId) {
    if (!isAdmin) return null;
    return (
      <Button
        variant="outline"
        size="sm"
        render={<Link href={saPath("/dashboard/settings")} />}
        title="Set your RPR org code in Settings to enable this"
      >
        <Lock className="mr-1.5 h-4 w-4" /> View on RPR
      </Button>
    );
  }

  function handleClick() {
    const target =
      buildRprPropertyUrl({
        rprOrgId: rprOrgId!,
        mlsId,
        address,
        city,
        state,
        zip,
      }) ?? buildRprHomeUrl(rprOrgId!);
    // The new tab is its own confirmation, so there is nothing to announce —
    // except when the browser blocks it, which would otherwise look like a
    // dead button.
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.error(
        "Your browser blocked the RPR tab. Allow pop-ups for this site and try again."
      );
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <ExternalLink className="mr-1.5 h-4 w-4" /> View on RPR
    </Button>
  );
}
