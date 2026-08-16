import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePublicUrl } from "@/lib/net/public-url";
import {
  evaluateLivenessResponse,
  isVerificationCurrent,
  livenessNetworkFailure,
  type SiteVerificationRecord,
} from "@/lib/site-health/liveness";

/**
 * POST /api/sub-accounts/[id]/site-health/verify-site
 *
 * Checks that the agent's saved domain serves a live site over HTTPS and
 * stores the verdict on the sub-account. This is what lets an agent who
 * keeps their existing website reach 100% Site Health without rebuilding it
 * inside AgentStack — and it stays honest, because the record expires and a
 * site that goes dark stops counting on the next check.
 *
 * The URL comes from the saved domain rather than the request body: this
 * endpoint makes a server-side request, so accepting a caller-supplied
 * target would be an SSRF regardless of the guard on it.
 */

const REQUEST_TIMEOUT_MS = 8000;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}`);
  const snap = await ref.get();
  const sub = snap.data() ?? {};
  const customDomain =
    typeof sub.customDomain === "string" ? sub.customDomain.trim() : "";

  if (!customDomain) {
    return NextResponse.json(
      {
        error:
          "Save your domain first — we check the address you have connected.",
      },
      { status: 409 }
    );
  }

  const target = normalizePublicUrl(customDomain);
  if (!target) {
    return NextResponse.json(
      { error: "That domain does not look like a public web address." },
      { status: 400 }
    );
  }
  // The probe requires TLS: an agent site collecting lead details over plain
  // http should not count as a healthy website.
  target.protocol = "https:";

  const existing = sub.externalSiteVerification as
    | SiteVerificationRecord
    | undefined;
  const force =
    (await request
      .json()
      .catch(() => ({}))
      .then((body: { force?: unknown }) => body?.force === true)) === true;

  // Skip the outbound request when a current verification already covers
  // this domain, so a dashboard load never fans out to the agent's host.
  if (!force && isVerificationCurrent(existing, customDomain)) {
    return NextResponse.json({ verification: existing, cached: true });
  }

  let record: SiteVerificationRecord;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(target.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "AgentStack-SiteHealth/1.0" },
    });
    record = evaluateLivenessResponse({
      url: target.toString(),
      protocol: target.protocol,
      statusCode: response.status,
    });
  } catch {
    record = livenessNetworkFailure(target.toString());
  } finally {
    clearTimeout(timeout);
  }

  await ref.set(
    {
      externalSiteVerification: record,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({ verification: record, cached: false });
}
