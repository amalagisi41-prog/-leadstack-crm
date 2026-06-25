import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";

type Claims = {
  status?: string;
  agencyRole?: string;
};

interface AuthedOwner {
  uid: string;
  email: string;
}

/**
 * Server-component helper. Returns the current agency owner or null. Pages
 * that need agency-owner gating should call this and notFound()/redirect()
 * on null — keeps the unauthorized response indistinguishable from a real
 * 404, which avoids advertising the existence of admin pages.
 */
export async function getCurrentAgencyOwner(): Promise<AuthedOwner | null> {
  const hdrs = await headers();
  const uid = hdrs.get("x-user-uid");
  if (!uid) return null;

  try {
    const record = await getAdminAuth().getUser(uid);
    const claims = (record.customClaims ?? {}) as Claims;
    if (claims.status !== "active") return null;
    if (claims.agencyRole !== "owner") return null;
    return { uid, email: record.email ?? hdrs.get("x-user-email") ?? "" };
  } catch {
    return null;
  }
}

/**
 * API-route helper. Returns the authed owner OR a 403/401 NextResponse the
 * route should return immediately. Mirrors the existing requireAdmin shape.
 */
export async function requireAgencyOwner(
  request: Request,
): Promise<AuthedOwner | NextResponse> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const record = await getAdminAuth().getUser(uid);
    const claims = (record.customClaims ?? {}) as Claims;
    if (claims.status !== "active") {
      return NextResponse.json({ error: "Account inactive" }, { status: 403 });
    }
    if (claims.agencyRole !== "owner") {
      return NextResponse.json({ error: "Agency owner only" }, { status: 403 });
    }
    return {
      uid,
      email: record.email ?? request.headers.get("x-user-email") ?? "",
    };
  } catch {
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }
}
