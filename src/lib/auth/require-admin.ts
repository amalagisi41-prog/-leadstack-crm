import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import type { Role, MemberStatus } from "@/types";

interface AuthedAdmin {
  uid: string;
  email: string;
}

interface AuthedMember {
  uid: string;
  email: string;
  role: Role;
}

type Claims = { role?: Role; status?: MemberStatus };

function readUidFromHeaders(request: Request): {
  uid: string;
  email: string;
} | null {
  const uid = request.headers.get("x-user-uid");
  if (!uid) return null;
  return { uid, email: request.headers.get("x-user-email") ?? "" };
}

async function readClaims(uid: string): Promise<Claims> {
  const record = await getAdminAuth().getUser(uid);
  return (record.customClaims ?? {}) as Claims;
}

export async function requireAdmin(
  request: Request,
): Promise<AuthedAdmin | NextResponse> {
  const headerAuth = readUidFromHeaders(request);
  if (!headerAuth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const claims = await readClaims(headerAuth.uid);
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  if (claims.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return headerAuth;
}

export async function requireActiveMember(
  request: Request,
): Promise<AuthedMember | NextResponse> {
  const headerAuth = readUidFromHeaders(request);
  if (!headerAuth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const claims = await readClaims(headerAuth.uid);
  if (claims.status !== "active" || !claims.role) {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  return { ...headerAuth, role: claims.role };
}

/**
 * For Server Actions (no Request object available). Reads the __session cookie,
 * verifies it via Admin SDK, and confirms the caller has role === "admin".
 * Throws on failure — server actions surface thrown errors back to the client.
 */
export async function requireAdminAction(): Promise<{ uid: string; email: string }> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;
  if (!sessionCookie) {
    throw new Error("Not authenticated.");
  }
  const decoded = await getAdminAuth()
    .verifySessionCookie(sessionCookie, true)
    .catch(() => null);
  if (!decoded) {
    throw new Error("Invalid session.");
  }
  const claims = decoded as unknown as Claims;
  if (claims.status !== "active") {
    throw new Error("Account inactive.");
  }
  if (claims.role !== "admin") {
    throw new Error("Admin only.");
  }
  return { uid: decoded.uid, email: decoded.email ?? "" };
}
