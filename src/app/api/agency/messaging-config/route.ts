import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { emailIsConfigured } from "@/lib/comms/resend";
import { smsIsConfigured } from "@/lib/comms/twilio";
import type { AgencyDoc, AgencyRole, MemberStatus } from "@/types";

/**
 * Agency-owner-only, READ-ONLY view of the shared (deployment-wide) messaging
 * senders — the Twilio SMS + Resend email creds that every sub-account without
 * its own dedicated config falls back to. These live in environment variables,
 * so this endpoint reports their PRESENCE plus the non-sensitive identifiers
 * (From number, EMAIL_FROM, masked Account SID). It NEVER returns the secrets
 * (auth token, API key) — only whether they're set. Gated to the agency owner
 * because env-var presence is sensitive.
 */

export const dynamic = "force-dynamic";

interface CallerClaims {
  agencyRole?: AgencyRole | null;
  agencyId?: string | null;
  status?: MemberStatus;
}

function present(v: string | undefined): boolean {
  return !!v?.trim();
}

function trimOrNull(v: string | undefined): string | null {
  return v?.trim() || null;
}

/** Reveal only the first 2 + last 4 chars of a semi-sensitive identifier. */
function maskMiddle(v: string | undefined): string | null {
  const s = v?.trim();
  if (!s) return null;
  if (s.length <= 6) return "•".repeat(s.length);
  return `${s.slice(0, 2)}••••••${s.slice(-4)}`;
}

export async function GET(request: Request) {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const record = await getAdminAuth().getUser(uid);
  const claims = (record.customClaims ?? {}) as CallerClaims;
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  if (claims.agencyRole !== "owner") {
    return NextResponse.json({ error: "Agency owner only" }, { status: 403 });
  }

  // Read the agency policy flag (default ON — undefined/true means allowed).
  let sharedSmsAllowed = true;
  if (claims.agencyId) {
    const snap = await getAdminDb().doc(`agencies/${claims.agencyId}`).get();
    const data = snap.data() as Pick<AgencyDoc, "sharedSmsAllowed"> | undefined;
    sharedSmsAllowed = data?.sharedSmsAllowed !== false;
  }

  return NextResponse.json({
    sms: {
      configured: smsIsConfigured(),
      fromNumber: trimOrNull(process.env.TWILIO_FROM_NUMBER),
      accountSidMasked: maskMiddle(process.env.TWILIO_ACCOUNT_SID),
      authTokenSet: present(process.env.TWILIO_AUTH_TOKEN),
      sharedAllowed: sharedSmsAllowed,
    },
    email: {
      configured: emailIsConfigured(),
      fromAddress: trimOrNull(process.env.EMAIL_FROM),
      apiKeySet: present(process.env.RESEND_API_KEY),
    },
  });
}
