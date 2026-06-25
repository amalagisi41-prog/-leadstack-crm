import "server-only";

import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import {
  MEMBER_SESSION_COOKIE,
  MEMBER_SESSION_MAX_AGE_SECONDS,
  verifyMemberSessionToken,
} from "@/lib/community/member-auth";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Member } from "@/types/community";

/**
 * Reads the member session cookie, verifies the HMAC signature, confirms the
 * token is scoped to the requested sub-account, and loads the current member
 * doc. Returns null when the cookie is missing, invalid, expired, scoped to a
 * DIFFERENT sub-account, or the member no longer exists / was removed.
 *
 * The sub-account scope check is the boundary that stops a session minted for
 * one tenant's community being replayed against another's.
 *
 * Server-only — called from `/c/*` server components and member route handlers.
 */
export async function getCurrentMember(
  subAccountId: string,
): Promise<Member | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(MEMBER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const verified = verifyMemberSessionToken(token);
  if (!verified || verified.subAccountId !== subAccountId) return null;

  const ref = getAdminDb()
    .doc(`subAccounts/${subAccountId}/members/${verified.memberId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const data = snap.data() as Omit<Member, "id">;
  if (data.status !== "active") return null;

  // Best-effort "last active" stamp; never block the read on it.
  void ref
    .set({ lastSeenAt: FieldValue.serverTimestamp() }, { merge: true })
    .catch(() => {});

  return { id: snap.id, ...data };
}

export async function setMemberSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(MEMBER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MEMBER_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearMemberSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(MEMBER_SESSION_COOKIE);
}
