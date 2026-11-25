import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isDeploymentOperatorEmail } from "@/lib/auth/operator";
import { emailIsConfigured } from "@/lib/comms/resend";
import { smsIsConfigured } from "@/lib/comms/twilio";
import { metaAppConfigured } from "@/lib/comms/meta";
import { googleAccountClient } from "@/lib/google/account-connect";
import { googleWorkspaceIsConfigured } from "@/lib/comms/google-workspace";
import { buildCustomerStatus, type WorkspaceConnectionInputs } from "@/lib/agency/customer-status";
import type { AgencyRole, MemberStatus, SubAccountDoc } from "@/types";

/**
 * Customer-facing agency Status: the connections an agency owner can make
 * themselves, per workspace, in plain language (see lib/agency/customer-
 * status.ts). Server configuration enters only as booleans that decide
 * whether a feature is offered; nothing about it is returned. `internal` tells
 * the page whether to show the operator-only Internal tab.
 */
interface CallerClaims {
  agencyId?: string | null;
  agencyRole?: AgencyRole | null;
  status?: MemberStatus;
}

export async function GET(request: Request) {
  const uid = request.headers.get("x-user-uid");
  if (!uid) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const record = await getAdminAuth().getUser(uid).catch(() => null);
  const claims = (record?.customClaims ?? {}) as CallerClaims;
  if (!record || claims.status !== "active" || claims.agencyRole !== "owner" || !claims.agencyId) {
    return NextResponse.json({ error: "Only the account owner can view this." }, { status: 403 });
  }

  const emailShared = emailIsConfigured();
  const textingShared = smsIsConfigured();
  const googleConnectAvailable = googleAccountClient() !== null;
  const metaAvailable = metaAppConfigured();

  const snap = await getAdminDb().collection("subAccounts").where("agencyId", "==", claims.agencyId).get();
  const workspaces: WorkspaceConnectionInputs[] = snap.docs.map((doc) => {
    const sa = doc.data() as SubAccountDoc;
    const googleConnected =
      sa.googleAccountConfig?.status === "connected" ||
      googleWorkspaceIsConfigured((sa as { googleWorkspaceConfig?: Parameters<typeof googleWorkspaceIsConfigured>[0] }).googleWorkspaceConfig);
    return {
      subAccountId: doc.id,
      subAccountName: sa.name ?? "Your workspace",
      emailWorks: emailShared || googleConnected,
      emailConnectAvailable: googleConnectAvailable,
      textingWorks: textingShared || sa.twilioConfig?.enabled === true,
      socialOffered:
        metaAvailable && (sa.metaInboxEnabledByAgency === true || sa.socialPlannerEnabledByAgency === true),
      socialConnected: sa.metaConfig?.connected === true,
      listingsOffered: sa.idxEnabledByAgency === true,
      listingsConnected: sa.idxConfig?.enabled === true,
    };
  });

  return NextResponse.json({
    items: buildCustomerStatus(workspaces),
    internal: isDeploymentOperatorEmail(record.email),
  });
}
