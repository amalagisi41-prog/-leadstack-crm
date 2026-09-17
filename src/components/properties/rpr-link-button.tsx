"use client";

import Link from "next/link";
import { ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { buildRprHomeUrl, formatAddressForRpr } from "@/lib/rpr/link";

/**
 * "View on RPR" — opens the agent's own RPR (Realtors Property Resource)
 * account via their MLS-SSO entry point and copies the property address so
 * it can be pasted into RPR's search box.
 *
 * RPR resolves every property page through an internal property id we have
 * no legitimate way to obtain (verified live: a fabricated id 404s, and an
 * address search still resolves through that same internal id rather than
 * a linkable intermediate page). So this deliberately does NOT try to jump
 * straight to a specific property, CMA, or valuation page — that would be a
 * guessed link that might silently 404. See src/lib/rpr/link.ts.
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
}: {
  address: string;
  city: string;
  state: string;
  zip?: string | null;
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
    const line = formatAddressForRpr({ address, city, state, zip });
    void navigator.clipboard?.writeText(line).then(
      () => toast.success("Address copied — paste it into RPR's search box."),
      () => undefined
    );
    window.open(buildRprHomeUrl(rprOrgId!), "_blank", "noopener,noreferrer");
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <ExternalLink className="mr-1.5 h-4 w-4" /> View on RPR
    </Button>
  );
}
