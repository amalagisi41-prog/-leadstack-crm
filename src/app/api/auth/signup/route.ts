import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { provisionNewAgency } from "@/lib/auth/provision-agency";
import { isMarketingPlanKey } from "@/config/landing";
import { GLOBAL_TERRITORY_ID, type Role } from "@/types";

interface SignupBody {
  email?: string;
  password?: string;
  displayName?: string;
  planKey?: string;
}

type Decision =
  | { kind: "agencyOwner"; bootstrap: boolean }
  | {
      kind: "subAccountMember";
      adminUid: string;
      agencyId: string;
      subAccountId: string;
      subAccountRole: "admin" | "collaborator";
      inviteId: string;
      assignedTerritoryIds: string[];
    };

export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const displayName = body.displayName?.trim() || email?.split("@")[0] || "";
  const planKey = isMarketingPlanKey(body.planKey) ? body.planKey : null;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const auth = getAdminAuth();

  // Phase 1 — choose the tenancy path in a transaction. Invited users join
  // the workspace named by their invite. Every other registrant receives an
  // isolated agency + starter sub-account so public beta registration stays
  // open without weakening tenant boundaries.
  let decision: Decision;
  try {
    decision = await db.runTransaction<Decision>(async (tx) => {
      const cfgSnap = await tx.get(db.doc("appConfig/main"));
      if (!cfgSnap.exists) {
        const bootstrap = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
        if (bootstrap && bootstrap !== email) {
          throw new Error(
            "Only the configured bootstrap admin email may claim this agency.",
          );
        }
        return { kind: "agencyOwner", bootstrap: true };
      }
      const cfg = cfgSnap.data() ?? {};
      const adminUid = cfg.adminUid as string | undefined;
      if (!adminUid) {
        throw new Error("Workspace is misconfigured (missing adminUid).");
      }
      // Find an unrevoked, unaccepted typed invite for this email. Typed
      // invites name a specific sub-account + role; that's the membership
      // we'll mint.
      const inviteQuery = await tx.get(
        db
          .collection("invites")
          .where("email", "==", email)
          .where("acceptedByUid", "==", null)
          .where("revokedAt", "==", null)
          .limit(1),
      );
      if (inviteQuery.empty) {
        return { kind: "agencyOwner", bootstrap: false };
      }
      const inviteDoc = inviteQuery.docs[0];
      const invite = inviteDoc.data();
      const agencyId = invite.agencyId as string | undefined;
      const subAccountId = invite.subAccountId as string | null | undefined;
      const subAccountRole = invite.subAccountRole as
        | "admin"
        | "collaborator"
        | null
        | undefined;
      if (!agencyId || !subAccountId || !subAccountRole) {
        throw new Error(
          "Invite is missing tenancy fields. Ask the agency to re-invite you.",
        );
      }
      // Territories the inviting admin pre-assigned (collaborators only).
      // Empty / absent → default to Global so the new rep is visible
      // across the board until an admin narrows them down.
      const rawTerritories = invite.assignedTerritoryIds;
      const assignedTerritoryIds =
        Array.isArray(rawTerritories) &&
        rawTerritories.length > 0 &&
        subAccountRole === "collaborator"
          ? rawTerritories.filter((x): x is string => typeof x === "string")
          : [GLOBAL_TERRITORY_ID];
      return {
        kind: "subAccountMember",
        adminUid,
        agencyId,
        subAccountId,
        subAccountRole,
        inviteId: inviteDoc.id,
        assignedTerritoryIds,
      };
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Signup not allowed.";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  // Phase 2 — create the Firebase Auth user. Done after the gate so we
  // never leave orphan auth users when the gate rejects.
  let userRecord;
  try {
    userRecord = await auth.createUser({ email, password, displayName });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "An account already exists for this email." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not create account.",
      },
      { status: 500 },
    );
  }

  const uid = userRecord.uid;

  // Phase 3 — set custom claims, write the agency/sub-account/membership
  // graph, and finalize. If anything fails we delete the orphan auth user.
  try {
    if (decision.kind === "agencyOwner") {
      const { agencyId, subAccountId } = await provisionNewAgency({
        uid,
        email,
        displayName,
        bootstrap: decision.bootstrap,
        requiresEmailVerification: true,
      });

      return NextResponse.json({
        uid,
        role: "admin",
        agencyId,
        agencyRole: "owner",
        subAccountId,
        planKey,
        redirectTo: "/agency/get-started",
      });
    }

    // Branch: invited sub-account member.
    const { agencyId, subAccountId, subAccountRole, inviteId } = decision;

    // Read the sub-account name once for the userMemberships index entry.
    const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    const subName = (subSnap.data()?.name as string) ?? "Sub-account";

    await auth.setCustomUserClaims(uid, {
      // Legacy "role" claim mirrors the user's sub-account role only for
      // back-compat; sub-account-level decisions use the membership doc.
      role: (subAccountRole === "admin" ? "admin" : "collaborator") as Role,
      status: "active",
      agencyId,
      agencyRole: null,
      // Brand-new account (invited teammate's first signup) — same
      // verify-once requirement as every other new-account path. See
      // middleware.ts + /verify-email.
      requiresEmailVerification: true,
    });

    const batch = db.batch();

    batch.set(db.doc(`users/${uid}`), {
      uid,
      email,
      displayName,
      photoURL: null,
      stripeCustomerId: null,
      subscriptionStatus: "inactive",
      subscriptionPriceId: null,
      role: (subAccountRole === "admin" ? "admin" : "collaborator") as Role,
      status: "active",
      primaryAgencyId: agencyId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.set(
      db.doc(`subAccounts/${subAccountId}/subAccountMembers/${uid}`),
      {
        uid,
        subAccountId,
        agencyId,
        role: subAccountRole,
        status: "active",
        email,
        displayName,
        addedAt: FieldValue.serverTimestamp(),
        addedByUid: decision.adminUid,
        // Pre-assigned at invite time (collaborators only); falls back to
        // Global when the admin left it blank or invited an admin.
        assignedTerritoryIds: decision.assignedTerritoryIds,
      },
    );

    batch.set(
      db.doc(`userMemberships/${uid}/subAccounts/${subAccountId}`),
      {
        subAccountId,
        agencyId,
        role: subAccountRole,
        name: subName,
        addedAt: FieldValue.serverTimestamp(),
      },
    );

    batch.update(db.doc(`invites/${inviteId}`), {
      acceptedByUid: uid,
      acceptedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return NextResponse.json({
      uid,
      role: subAccountRole,
      agencyId,
      subAccountId,
      planKey,
      redirectTo: `/sa/${subAccountId}/dashboard`,
    });
  } catch (err) {
    await auth.deleteUser(uid).catch(() => undefined);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not finalize signup.",
      },
      { status: 500 },
    );
  }
}
