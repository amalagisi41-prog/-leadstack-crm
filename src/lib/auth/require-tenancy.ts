import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type {
  AgencyRole,
  MemberStatus,
  Role,
  SubAccountRole,
} from "@/types";

interface AuthedCaller {
  uid: string;
  email: string;
  agencyId: string | null;
  agencyRole: AgencyRole | null;
  status: MemberStatus;
}

interface SubAccountAccess extends AuthedCaller {
  subAccountId: string;
  subAccountRole: SubAccountRole | "agencyOwner";
}

type Claims = {
  role?: Role;
  status?: MemberStatus;
  agencyId?: string | null;
  agencyRole?: AgencyRole | null;
};

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

async function readCaller(
  request: Request,
): Promise<AuthedCaller | NextResponse> {
  const headerAuth = readUidFromHeaders(request);
  if (!headerAuth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const claims = await readClaims(headerAuth.uid);
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  return {
    uid: headerAuth.uid,
    email: headerAuth.email,
    agencyId: claims.agencyId ?? null,
    agencyRole: claims.agencyRole ?? null,
    status: claims.status,
  };
}

/** Caller must be the owner of the named agency. */
export async function requireAgencyOwner(
  request: Request,
  agencyId: string,
): Promise<AuthedCaller | NextResponse> {
  const caller = await readCaller(request);
  if (caller instanceof NextResponse) return caller;
  if (caller.agencyRole !== "owner" || caller.agencyId !== agencyId) {
    return NextResponse.json({ error: "Agency owner only" }, { status: 403 });
  }
  return caller;
}

/**
 * Caller may access the sub-account either as:
 *  - the agency owner of the sub-account's parent agency, OR
 *  - an active member of the sub-account itself (any role).
 */
export async function requireSubAccountMember(
  request: Request,
  subAccountId: string,
): Promise<SubAccountAccess | NextResponse> {
  const caller = await readCaller(request);
  if (caller instanceof NextResponse) return caller;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  const sub = subSnap.data() ?? {};

  if (caller.agencyRole === "owner" && caller.agencyId === sub.agencyId) {
    return { ...caller, subAccountId, subAccountRole: "agencyOwner" };
  }

  const memberSnap = await db
    .doc(`subAccounts/${subAccountId}/subAccountMembers/${caller.uid}`)
    .get();
  if (!memberSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const member = memberSnap.data() ?? {};
  if (member.status !== "active") {
    return NextResponse.json({ error: "Membership inactive" }, { status: 403 });
  }
  const role = member.role as SubAccountRole;
  return { ...caller, subAccountId, subAccountRole: role };
}

/** Caller must be admin in the sub-account (agency owners count as admin). */
export async function requireSubAccountAdmin(
  request: Request,
  subAccountId: string,
): Promise<SubAccountAccess | NextResponse> {
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (
    access.subAccountRole !== "admin" &&
    access.subAccountRole !== "agencyOwner"
  ) {
    return NextResponse.json(
      { error: "Sub-account admin only" },
      { status: 403 },
    );
  }
  return access;
}
