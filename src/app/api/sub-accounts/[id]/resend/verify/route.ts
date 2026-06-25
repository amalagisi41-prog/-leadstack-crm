import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { verifySendingDomain } from "@/lib/comms/resend-domains";
import type { ResendConfig } from "@/types";

/**
 * Trigger verification of the sub-account's sending domain. Asks Resend to
 * (re)check the published DNS, reads back the fresh status, and syncs it onto
 * resendConfig. The returned status may still be "pending" immediately after —
 * DNS propagation + Resend's check are asynchronous, so the operator may need
 * to click again shortly.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Resend isn't configured on this deployment (RESEND_API_KEY)." },
      { status: 503 },
    );
  }

  const subRef = getAdminDb().doc(`subAccounts/${subAccountId}`);
  const subData = (await subRef.get()).data();
  if (subData?.emailDomainEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "The dedicated email sending domain feature is disabled for this sub-account. Ask your agency owner to enable it.",
      },
      { status: 403 },
    );
  }
  if (!subData?.replyToEmail?.trim?.()) {
    return NextResponse.json(
      {
        error:
          "Set a Reply-To address on the Automations settings page first. Replies to broadcasts and automated emails would otherwise bounce — the sending subdomain has no inbox by default.",
      },
      { status: 400 },
    );
  }
  const cfg = subData?.resendConfig as ResendConfig | null | undefined;
  if (!cfg?.domainId) {
    return NextResponse.json(
      { error: "Add a sending domain before verifying." },
      { status: 400 },
    );
  }

  const result = await verifySendingDomain(cfg.domainId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Verification failed." },
      { status: 502 },
    );
  }

  await subRef.update({
    "resendConfig.status": result.status,
    "resendConfig.lastValidatedAt": new Date(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    status: result.status,
    records: result.records,
  });
}
