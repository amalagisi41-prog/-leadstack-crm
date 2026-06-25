import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { seedDemo, unseedDemo } from "@/lib/seed/demo-data";
import { LANDING_VARIANT } from "@/config/landing";
import type { MemberStatus, Role } from "@/types";

/**
 * Dev-only seed endpoint for the LeadStack public demo (#1004 sub-account).
 *
 * Triple-gated:
 *   1. LANDING_VARIANT must be "leadstack" — buyer clones (variant "custom")
 *      get a 404 so they don't even know this route exists.
 *   2. Caller must be the agency owner.
 *   3. Sub-account #1004 must already exist (the seeder targets it by
 *      accountNumber).
 *
 *   POST   /api/dev-only/seed-demo   -> seed 300 contacts + ~80 deals + activities
 *   DELETE /api/dev-only/seed-demo   -> remove every tag-"seed" contact + their deals
 */

interface CallerClaims {
  role?: Role;
  status?: MemberStatus;
  agencyRole?: "owner" | "staff" | null;
  agencyId?: string | null;
}

async function requireOwnerOrReject(
  request: Request,
): Promise<{ uid: string } | NextResponse> {
  // Variant gate first — pretend the route doesn't exist on buyer clones.
  if (LANDING_VARIANT !== "leadstack") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const record = await getAdminAuth().getUser(uid).catch(() => null);
  if (!record) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const claims = (record.customClaims ?? {}) as CallerClaims;
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  if (claims.agencyRole !== "owner" || !claims.agencyId) {
    return NextResponse.json(
      { error: "Only the agency owner can run the demo seeder." },
      { status: 403 },
    );
  }
  return { uid };
}

export async function POST(request: Request) {
  const access = await requireOwnerOrReject(request);
  if (access instanceof NextResponse) return access;

  try {
    const result = await seedDemo(getAdminDb());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seed failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await requireOwnerOrReject(request);
  if (access instanceof NextResponse) return access;

  try {
    const result = await unseedDemo(getAdminDb());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unseed failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
