import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import {
  collectHeartbeatStats,
  markGitpageBuildSucceeded,
  sendHeartbeat,
} from "@/lib/gitpage/heartbeat";
import type { AgencyRole, MemberStatus } from "@/types";

/**
 * Agency-owner-gated refresh of the gitpage activation status. Fires an
 * out-of-band heartbeat instead of waiting for the daily cron — used by:
 *   - the "Refresh status" button on the Lapsed-state panel
 *   - the visibility-change handler when the operator returns to the tab
 *     after subscribing on gitpage.site
 *
 * Returns the resulting status so the UI can update without waiting for
 * Firestore to fan-out the new doc.
 */
export async function POST(request: Request) {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const record = await getAdminAuth().getUser(uid);
  const claims = (record.customClaims ?? {}) as {
    agencyRole?: AgencyRole | null;
    status?: MemberStatus;
  };
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  if (claims.agencyRole !== "owner") {
    return NextResponse.json(
      { error: "Agency owner only" },
      { status: 403 },
    );
  }

  const stats = await collectHeartbeatStats();
  const result = await sendHeartbeat(stats);

  // Backfill: if the heartbeat couldn't confirm activation (network
  // failure, or — more commonly — gitpage's email-based subscription
  // lookup doesn't match the agency owner email LeadStack sent), check
  // whether any sub-account has a recent successful build. A build that
  // gitpage accepted within the last 7 days is stronger evidence than
  // the heartbeat. This matters when the operator has a working API key
  // but the gitpage subscription is held under a different email.
  const heartbeatConfirmed = result?.gitpageStatus?.agency === true;
  let backfilled = false;
  if (!heartbeatConfirmed) {
    try {
      const db = getAdminDb();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recent = await db
        .collectionGroup("website")
        .where("status", "==", "ready")
        .where("lastBuildAt", ">", sevenDaysAgo)
        .limit(1)
        .get();
      if (!recent.empty) {
        await markGitpageBuildSucceeded();
        backfilled = true;
      }
    } catch {
      // collectionGroup query may need an index in production; ignore.
    }
  }

  return NextResponse.json({
    ok: true,
    sent: result !== null,
    agency: result?.gitpageStatus?.agency ?? null,
    backfilled,
  });
}
