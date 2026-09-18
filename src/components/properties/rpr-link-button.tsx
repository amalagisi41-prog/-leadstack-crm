"use client";

import Link from "next/link";
import { ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import {
  buildRprHomeUrl,
  buildRprPropertyUrl,
  formatAddressForRpr,
} from "@/lib/rpr/link";

/**
 * "View on RPR" — opens this property inside the agent's own RPR (Realtors
 * Property Resource) account, through their MLS sign-in.
 *
 * It used to open RPR's home page and tell the agent to paste the address
 * into RPR's search box, on the belief that RPR could not be linked to a
 * specific property from outside. That was wrong: RPR publishes a deep-link
 * endpoint that takes an MLS listing number or a full address. The link is
 * now built from whichever of those this property has — see
 * src/lib/rpr/link.ts, including what that contract is and is not verified
 * against.
 *
 * The address still goes on the clipboard. It costs the agent nothing and
 * means that if a deep link ever lands on RPR's search instead of the
 * property, they are one paste from where they were going.
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
    const line = formatAddressForRpr({ address, city, state, zip });
    if (line) {
      void navigator.clipboard?.writeText(line).then(
        () =>
          toast.success(
            "Opening this property in RPR — address copied in case you need to search."
          ),
        () => undefined
      );
    }
    const target =
      buildRprPropertyUrl({
        rprOrgId: rprOrgId!,
        mlsId,
        address,
        city,
        state,
        zip,
      }) ?? buildRprHomeUrl(rprOrgId!);
    window.open(target, "_blank", "noopener,noreferrer");
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <ExternalLink className="mr-1.5 h-4 w-4" /> View on RPR
    </Button>
  );
}
