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
import { detectHostingPlatform } from "@/lib/site-health/platform-detection";

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
const MAX_REDIRECTS = 3;
/** Enough HTML to carry the platform fingerprints, not enough to be a DoS. */
const MAX_BODY_BYTES = 200_000;

async function readCappedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    // A truncated read still yields whatever arrived — good enough to scan.
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(
    chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)
  ).slice(0, MAX_BODY_BYTES);
}

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
    // Redirects are followed by hand, re-vetting every hop: `redirect:
    // "follow"` would let a redirect to 169.254.169.254 pull cloud metadata,
    // and the guard on the first URL cannot see later hops.
    let current = new URL(target.toString());
    const redirectHosts: string[] = [current.hostname];
    let response: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "AgentStack-SiteHealth/1.0" },
      });
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) break;
      const next = normalizePublicUrl(new URL(location, current).toString());
      if (!next) break; // redirect into a private address — stop, don't follow
      current = next;
      redirectHosts.push(current.hostname);
      response = null;
    }

    if (!response) {
      record = livenessNetworkFailure(target.toString());
    } else {
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const body = await readCappedBody(response);
      const detection = detectHostingPlatform({
        finalHost: current.hostname,
        headers,
        body,
        redirectHosts,
      });
      record = {
        ...evaluateLivenessResponse({
          url: current.toString(),
          protocol: current.protocol,
          statusCode: response.status,
        }),
        servedByPlatform: detection.platform,
        servedByLabel: detection.label,
        evidence: detection.evidence,
      };
    }
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
