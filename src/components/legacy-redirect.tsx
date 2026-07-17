"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";

/**
 * Stub page that redirects users hitting a legacy single-tenant path
 * (e.g. /contacts, /dashboard/settings) to the same path under the user's
 * first sub-account membership (e.g. /sa/{first}/contacts).
 *
 * Used for two cases:
 *   1. External / hard-coded links that still point at the legacy path
 *      (the landing-page navbar's "Go to Dashboard" button).
 *   2. Components inside the moved dashboard pages that haven't yet been
 *      updated to template their hrefs with the active sub-account.
 *
 * If the user has no memberships yet they're sent to /agency where they can
 * see the empty-state and create or join a sub-account.
 */
export function LegacyRedirect({
  /** Path suffix to append after /sa/{subAccountId}, e.g. "/contacts/abc". */
  toSubPath,
}: {
  toSubPath: string;
}) {
  const router = useRouter();
  const { loading, memberships, agencyRole } = useAuth();
  const { multiAccountModeEnabled, loading: agencyLoading } = useAgency();

  useEffect(() => {
    if (loading) return;
    const target = memberships[0];
    if (!target) {
      // No sub-accounts at all (including a broken bootstrap): /agency is
      // the only place that can create one or show the no-access state,
      // regardless of Solo Beta — there's nowhere else to send them.
      router.replace("/agency");
      return;
    }
    // Agency owners with no current sub-account context historically land
    // on /agency's picker when they hit the bare /dashboard URL. In Solo
    // Beta (the default — see AgencyDoc.multiAccountModeEnabled) that
    // picker is redundant for a single-sub-account agency, so skip it and
    // go straight into the one workspace. Wait for the agency doc to
    // hydrate first so we don't flash /agency then bounce again.
    if (agencyRole === "owner" && toSubPath === "/dashboard") {
      if (agencyLoading) return;
      if (multiAccountModeEnabled) {
        router.replace("/agency");
        return;
      }
    }
    router.replace(`/sa/${target.subAccountId}${toSubPath}`);
  }, [
    loading,
    memberships,
    agencyRole,
    toSubPath,
    router,
    agencyLoading,
    multiAccountModeEnabled,
  ]);

  return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="space-y-2 text-center">
        <div className="mx-auto h-6 w-24 animate-pulse rounded bg-muted" />
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}
