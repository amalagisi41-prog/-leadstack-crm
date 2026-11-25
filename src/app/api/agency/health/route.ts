import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { isDeploymentOperatorEmail } from "@/lib/auth/operator";
import { runHealthChecks, type IntegrationHealth } from "@/lib/health/checks";
import type { AgencyRole, MemberStatus } from "@/types";

/**
 * INTERNAL, deployment-operator-only health snapshot. Returns one row per integration so the
 * agency dashboard can render traffic-light status. Caches results in
 * memory for 60s — refresh forced via `?refresh=1`.
 *
 * Auth: caller must be an agency owner AND the deployment operator
 * (BOOTSTRAP_ADMIN_EMAIL). It reveals env-var presence, secret names and vendor
 * services — configuration only the operator can fix. Every other agency owner
 * is a paying customer and gets the plain-language view at /api/agency/status.
 */

interface CacheEntry {
  results: IntegrationHealth[];
  cachedAt: number;
}

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, CacheEntry>();

interface CallerClaims {
  agencyId?: string | null;
  agencyRole?: AgencyRole | null;
  status?: MemberStatus;
}

async function readOwnerCaller(
  request: Request,
): Promise<{ agencyId: string } | NextResponse> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const record = await getAdminAuth().getUser(uid);
  const claims = (record.customClaims ?? {}) as CallerClaims;
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  if (claims.agencyRole !== "owner" || !claims.agencyId || !isDeploymentOperatorEmail(record.email)) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }
  return { agencyId: claims.agencyId };
}

export async function GET(request: Request) {
  const auth = await readOwnerCaller(request);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const cached = cache.get(auth.agencyId);
  if (
    cached &&
    !refresh &&
    Date.now() - cached.cachedAt < CACHE_TTL_MS
  ) {
    const requiredProblems = cached.results.filter(
      (result) => result.required && result.status !== "ok",
    );
    return NextResponse.json({
      results: cached.results,
      cachedAt: cached.cachedAt,
      fresh: false,
      requiredReady: requiredProblems.length === 0,
      requiredMissing: requiredProblems.map((result) => result.id),
    });
  }

  const results = await runHealthChecks();
  const requiredProblems = results.filter(
    (result) => result.required && result.status !== "ok",
  );
  const cachedAt = Date.now();
  cache.set(auth.agencyId, { results, cachedAt });
  return NextResponse.json({
    results,
    cachedAt,
    fresh: true,
    requiredReady: requiredProblems.length === 0,
    requiredMissing: requiredProblems.map((result) => result.id),
  });
}
