import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { seedDefaultTemplates } from "@/lib/automations/seed-templates";
import { GLOBAL_TERRITORY_ID, type Role } from "@/types";

interface SignupBody {
  email?: string;
  password?: string;
  displayName?: string;
}

type Decision =
  | { kind: "agencyOwner" }
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

  // Phase 1 — gate decision in a transaction. Either claim the agency-owner
  // slot (if appConfig/main doesn't exist yet) or consume a pending invite.
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
        return { kind: "agencyOwner" };
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
        throw new Error(
          "This email is not invited. Ask the agency to invite you.",
        );
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
      const agencyRef = db.collection("agencies").doc();
      const subAccountRef = db.collection("subAccounts").doc();
      const agencyId = agencyRef.id;
      const subAccountId = subAccountRef.id;
      const agencyName = `${displayName || email.split("@")[0]}'s Agency`;

      await auth.setCustomUserClaims(uid, {
        // Legacy claim — still consumed by the existing dashboard pages
        // until Phase 2 swaps them out. agencyOwner == admin everywhere.
        role: "admin" as Role,
        status: "active",
        // Agency-model claims.
        agencyId,
        agencyRole: "owner",
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
        role: "admin" as Role,
        status: "active",
        primaryAgencyId: agencyId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      batch.set(agencyRef, {
        id: agencyId,
        name: agencyName,
        ownerUid: uid,
        stripeCustomerId: null,
        subscriptionStatus: "inactive",
        subscriptionPriceId: null,
        logoUrl: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      batch.set(
        agencyRef.collection("agencyMembers").doc(uid),
        {
          uid,
          agencyId,
          role: "owner",
          status: "active",
          email,
          displayName,
          addedAt: FieldValue.serverTimestamp(),
          addedByUid: uid,
        },
      );

      batch.set(subAccountRef, {
        id: subAccountId,
        agencyId,
        accountNumber: 1000,
        name: "Main",
        slug: "main",
        status: "active",
        timezone: "UTC",
        createdByUid: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        twilioConfig: null,
        resendConfig: null,
        emailDomainEnabledByAgency: false,
        outboundVoiceEnabledByAgency: false,
        whatsappEnabledByAgency: false,
        metaInboxEnabledByAgency: false,
        websiteEnabledByAgency: false,
        communityEnabledByAgency: false,
        metaConfig: null,
        bookingConfig: null,
        sendWindow: null,
        bookingLink: null,
        replyToEmail: null,
        automationsPaused: false,
      });

      // Seed the per-agency counter so the next sub-account picks up at
      // 1001. Lives at agencies/{agencyId}/counters/subAccount; mutated
      // exclusively by /api/agency/sub-accounts inside a transaction.
      batch.set(
        agencyRef.collection("counters").doc("subAccount"),
        { next: 1001 },
      );

      batch.set(
        subAccountRef.collection("subAccountMembers").doc(uid),
        {
          uid,
          subAccountId,
          agencyId,
          role: "admin",
          status: "active",
          email,
          displayName,
          addedAt: FieldValue.serverTimestamp(),
          addedByUid: uid,
          // Default to Global so the member sees everything if scoping
          // is later enabled before the admin carves out territories.
          // (Owners/admins are exempt at runtime anyway.)
          assignedTerritoryIds: [GLOBAL_TERRITORY_ID],
        },
      );

      // Per-user denormalized index, used by the sub-account switcher.
      batch.set(
        db.doc(`userMemberships/${uid}/agencies/${agencyId}`),
        {
          agencyId,
          role: "owner",
          name: agencyName,
        },
      );
      batch.set(
        db.doc(`userMemberships/${uid}/subAccounts/${subAccountId}`),
        {
          subAccountId,
          agencyId,
          accountNumber: 1000,
          role: "admin",
          name: "Main",
          addedAt: FieldValue.serverTimestamp(),
        },
      );

      batch.set(db.doc("appConfig/main"), {
        adminUid: uid,
        adminEmail: email,
        firstAgencyId: agencyId,
        firstAgencyOwnerUid: uid,
        bootstrapEmail: email,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Seed Welcome email + Welcome SMS templates into the bootstrap
      // sub-account so the agency owner sees usable defaults the first
      // time they open Automations → Templates.
      seedDefaultTemplates(db, (ref, data) => batch.set(ref, data), {
        agencyId,
        subAccountId,
        createdByUid: uid,
      });

      await batch.commit();

      return NextResponse.json({
        uid,
        role: "admin",
        agencyId,
        agencyRole: "owner",
        subAccountId,
        redirectTo: "/agency",
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
