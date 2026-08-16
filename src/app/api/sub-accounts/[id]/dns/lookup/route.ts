import "server-only";

import { Resolver } from "node:dns/promises";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePublicUrl } from "@/lib/net/public-url";
import type {
  DnsRecordSnapshot,
  DomainDnsSnapshot,
} from "@/lib/dns/records";

/**
 * GET /api/sub-accounts/[id]/dns/lookup
 *
 * Reads the domain's current public DNS so the cutover guide can show an
 * agent exactly what they have, rather than asking them to know it. The
 * whole point is that nobody has to understand DNS to copy it correctly.
 *
 * Uses public resolvers explicitly instead of the container's, so the answer
 * reflects what the internet sees rather than anything local.
 */

export const runtime = "nodejs";
const PUBLIC_RESOLVERS = ["1.1.1.1", "8.8.8.8"];
const LOOKUP_TIMEOUT_MS = 6000;

/** A resolver failure means "no records of this type", not a broken request. */
async function safely<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch {
    return fallback;
  }
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  const customDomain =
    typeof snap.data()?.customDomain === "string"
      ? snap.data()!.customDomain.trim()
      : "";
  if (!customDomain) {
    return NextResponse.json(
      { error: "Save your domain first." },
      { status: 409 }
    );
  }

  // Reuse the public-URL guard so an internal hostname can never be probed,
  // then reduce to the bare registrable name the resolver needs.
  const parsed = normalizePublicUrl(customDomain);
  if (!parsed) {
    return NextResponse.json(
      { error: "That domain does not look like a public web address." },
      { status: 400 }
    );
  }
  const domain = parsed.hostname.replace(/^www\./, "");

  const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 2 });
  resolver.setServers(PUBLIC_RESOLVERS);

  const [nameservers, mx, txt, a, wwwCname, dmarc, wwwA] = await Promise.all([
    safely(resolver.resolveNs(domain), [] as string[]),
    safely(resolver.resolveMx(domain), [] as { priority: number; exchange: string }[]),
    safely(resolver.resolveTxt(domain), [] as string[][]),
    safely(resolver.resolve4(domain), [] as string[]),
    safely(resolver.resolveCname(`www.${domain}`), [] as string[]),
    safely(resolver.resolveTxt(`_dmarc.${domain}`), [] as string[][]),
    safely(resolver.resolve4(`www.${domain}`), [] as string[]),
  ]);

  const records: DnsRecordSnapshot[] = [
    ...mx.map((entry) => ({
      kind: "MX" as const,
      name: "@",
      value: entry.exchange,
      priority: entry.priority,
    })),
    ...txt.map((chunks) => ({
      kind: "TXT" as const,
      name: "@",
      value: chunks.join(""),
    })),
    ...dmarc.map((chunks) => ({
      kind: "TXT" as const,
      name: "_dmarc",
      value: chunks.join(""),
    })),
    ...a.map((value) => ({ kind: "A" as const, name: "@", value })),
    ...wwwCname.map((value) => ({ kind: "CNAME" as const, name: "www", value })),
    // Only record a www A record when there is no CNAME — a host cannot have
    // both, and showing both would have the agent create an invalid pair.
    ...(wwwCname.length === 0
      ? wwwA.map((value) => ({ kind: "A" as const, name: "www", value }))
      : []),
  ];

  const snapshot: DomainDnsSnapshot = {
    domain,
    nameservers: nameservers.map((ns) => ns.replace(/\.$/, "")),
    records,
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json({ snapshot });
}
