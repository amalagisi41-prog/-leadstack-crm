import "server-only";

import { Resolver } from "node:dns/promises";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePublicUrl } from "@/lib/net/public-url";
import { appHost, normalizeHost } from "@/lib/domains/app-hosts";

/**
 * POST /api/sub-accounts/[id]/domain/verify
 *
 * Checks whether the saved custom domain actually points at this deployment,
 * and records the answer.
 *
 * WHY THIS EXISTS
 * ---------------
 * Nothing verified anything before. "Connect Domain" wrote a string, and the
 * DNS step in the walkthrough told agents their domain "already points where
 * it should" purely on the basis of which host they had picked from a
 * dropdown. When that answer was wrong — and it was, routinely, because the
 * dropdown didn't contain their actual host — the product cheerfully confirmed
 * a broken setup as correct.
 *
 * This returns what the public internet actually reports, and says "unknown"
 * rather than "fine" when it cannot tell. Absence of evidence is not evidence
 * of success.
 */

export const runtime = "nodejs";

const PUBLIC_RESOLVERS = ["1.1.1.1", "8.8.8.8"];
const LOOKUP_TIMEOUT_MS = 6000;

export type DomainVerifyState =
  | "live"
  | "points_elsewhere"
  | "no_records"
  | "unknown";

async function safely<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch {
    return fallback;
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const snap = await db.doc(`subAccounts/${id}`).get();
  const customDomain =
    typeof snap.data()?.customDomain === "string"
      ? snap.data()!.customDomain.trim()
      : "";

  if (!customDomain) {
    return NextResponse.json({ error: "Save your domain first." }, { status: 409 });
  }

  // Reuse the public-URL guard so an internal hostname can never be probed.
  const parsed = normalizePublicUrl(customDomain);
  if (!parsed) {
    return NextResponse.json(
      { error: "That domain does not look like a public web address." },
      { status: 400 },
    );
  }
  const domain = normalizeHost(parsed.hostname).replace(/^www\./, "");

  const target = appHost();
  if (!target) {
    // Without knowing our own hostname there is nothing to compare against.
    // Say so plainly instead of returning a verdict we cannot support.
    return NextResponse.json(
      {
        state: "unknown" as DomainVerifyState,
        domain,
        detail:
          "This deployment doesn't know its own address (NEXT_PUBLIC_APP_URL isn't set), so we can't check where your domain points.",
      },
      { status: 200 },
    );
  }

  const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 2 });
  resolver.setServers(PUBLIC_RESOLVERS);

  const [apex, cname, wwwCname, targetIps] = await Promise.all([
    safely(resolver.resolve4(domain), [] as string[]),
    safely(resolver.resolveCname(domain), [] as string[]),
    safely(resolver.resolveCname(`www.${domain}`), [] as string[]),
    safely(resolver.resolve4(target), [] as string[]),
  ]);

  const cnames = [...cname, ...wwwCname].map((v) =>
    normalizeHost(v).replace(/\.$/, ""),
  );

  // Two ways a domain can correctly point here: a CNAME naming our host, or
  // A records matching the addresses our own host resolves to.
  const cnameMatches = cnames.some(
    (value) => value === target || value.endsWith(".vercel-dns.com"),
  );
  const aMatches =
    apex.length > 0 &&
    targetIps.length > 0 &&
    apex.some((ip) => targetIps.includes(ip));

  let state: DomainVerifyState;
  let detail: string;

  if (cnameMatches || aMatches) {
    state = "live";
    detail = `${domain} is pointing at this deployment.`;
  } else if (apex.length === 0 && cnames.length === 0) {
    state = "no_records";
    detail = `${domain} has no A or CNAME records yet. If you've just changed them, DNS can take up to an hour to update.`;
  } else if (targetIps.length === 0) {
    // We could read THEIR records but not ours, so we cannot compare. This is
    // the case that most deserves "unknown" rather than a confident verdict.
    state = "unknown";
    detail = `${domain} has DNS records, but we couldn't resolve this deployment's own address to compare them against. Try again shortly.`;
  } else {
    state = "points_elsewhere";
    detail = `${domain} currently points somewhere else${
      cnames.length ? ` (${cnames[0]})` : ""
    }. Update it to point at ${target}, then check again.`;
  }

  await db.doc(`subAccounts/${id}`).update({
    customDomainState: state,
    customDomainCheckedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    state,
    domain,
    target,
    detail,
    // Returned so the UI can show the agent the evidence rather than asking
    // them to trust a verdict.
    found: { aRecords: apex, cnames },
  });
}
