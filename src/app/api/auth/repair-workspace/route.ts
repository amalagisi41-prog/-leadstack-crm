import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { provisionNewAgency } from "@/lib/auth/provision-agency";

/**
 * POST /api/auth/repair-workspace
 *
 * Self-heal for a signed-in, active user whose account somehow has no
 * tenancy: no `agencyId` custom claim and no `users/{uid}.primaryAgencyId`.
 * This shouldn't happen on the happy path (every signup route — email/
 * password and OAuth via /api/auth/oauth-provision — provisions an agency
 * before returning), but a partial failure upstream (e.g. a client that
 * navigated away before its claims finished propagating, or an account
 * created outside the normal signup flow) can leave a user stuck seeing
 * "sign in to view your agency" despite being fully authenticated.
 *
 * Idempotent: if the user already has a home agency (via claims or the
 * Firestore doc), this just returns it — it never mints a second one.
 *
 * Auth: caller must be signed in (x-user-uid header set by middleware).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let auth, db;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (error) {
    // Admin SDK init failure (e.g. missing/malformed FIREBASE_ADMIN_* env
    // vars on this deployment) — surface it instead of letting Next.js's
    // generic uncaught-exception 500 mask the real cause.
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Server misconfiguration: ${error.message}`
            : "Server misconfiguration.",
      },
      { status: 500 },
    );
  }

  let userRecord;
  try {
    userRecord = await auth.getUser(uid);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `User account not found: ${error.message}`
            : "User account not found",
      },
      { status: 404 },
    );
  }

  const email = userRecord.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "User account has no email" }, { status: 400 });
  }

  const existingAgencyId = userRecord.customClaims?.agencyId as string | undefined;
  let userDoc: FirebaseFirestore.DocumentData | null;
  try {
    const userSnap = await db.doc(`users/${uid}`).get();
    userDoc = userSnap.exists ? userSnap.data() ?? null : null;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Could not read your account: ${error.message}`
            : "Could not read your account.",
      },
      { status: 500 },
    );
  }

  // Already has a home agency somewhere — nothing to repair. Return
  // whichever source has it so the client can just re-sync.
  const agencyId = existingAgencyId || (userDoc?.primaryAgencyId as string | undefined);
  if (agencyId) {
    return NextResponse.json({ repaired: false, agencyId });
  }

  // Never got an active user doc at all — this isn't a repairable "no
  // tenancy" case, it's a genuinely missing account. Don't silently
  // provision a workspace for something that failed for another reason.
  if (userDoc && userDoc.status !== "active") {
    return NextResponse.json(
      { error: "This account isn't active. Contact your agency owner." },
      { status: 403 },
    );
  }

  // Transactional claim: the check above and the provision call below
  // aren't atomic on their own, so two concurrent calls (the automatic
  // silent retry in AuthContext racing a manual "Retry setup" click, or a
  // double-click) could both read "no agencyId" and each mint a SEPARATE
  // agency + Main sub-account — one wins the final custom-claims write,
  // orphaning the other (still reachable via its own userMemberships row,
  // just invisible from the winning agency's sub-accounts list). Claim a
  // short-lived lock on the user doc first so only one call per uid can
  // actually provision; a stale lock (a previous attempt crashed) expires
  // after 30s so a genuine retry isn't blocked forever.
  const LOCK_TTL_MS = 30_000;
  const userRef = db.doc(`users/${uid}`);
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists ? snap.data() : null;
    if (data?.primaryAgencyId) {
      return { status: "already-done" as const, agencyId: data.primaryAgencyId as string };
    }
    const lockedAt = data?.repairInProgressAt as number | undefined;
    if (lockedAt && Date.now() - lockedAt < LOCK_TTL_MS) {
      return { status: "in-progress" as const };
    }
    tx.set(userRef, { repairInProgressAt: Date.now() }, { merge: true });
    return { status: "claimed" as const };
  });

  if (claim.status === "already-done") {
    return NextResponse.json({ repaired: false, agencyId: claim.agencyId });
  }
  if (claim.status === "in-progress") {
    return NextResponse.json(
      { error: "Setup is already in progress. Please wait a moment and reload." },
      { status: 409 },
    );
  }

  const displayName =
    userRecord.displayName?.trim() || email.split("@")[0] || "AgentStack user";

  try {
    const { agencyId: newAgencyId, subAccountId } = await provisionNewAgency({
      uid,
      email,
      displayName,
      bootstrap: false,
    });
    return NextResponse.json({ repaired: true, agencyId: newAgencyId, subAccountId });
  } catch (error) {
    // Provisioning failed — clear the lock so a retry isn't blocked by
    // "already in progress" for the rest of the TTL window.
    await userRef.set({ repairInProgressAt: null }, { merge: true }).catch(() => undefined);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not set up your workspace. Contact support.",
      },
      { status: 500 },
    );
  }
}
