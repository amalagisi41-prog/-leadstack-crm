import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { seedDefaultTemplates } from "@/lib/automations/seed-templates";
import { seedMethodTemplates } from "@/lib/provisioning/method-templates";
import { GLOBAL_TERRITORY_ID, type Role } from "@/types";

/**
 * The agency/sub-account/membership/claims batch-write shared by every path
 * that mints a brand-new agency for a Firebase Auth user:
 *   - `/api/auth/signup`'s bootstrap + public-registration branches
 *   - `/api/auth/claim-subscription` (paid self-serve signup — see "Real
 *     self-serve billing")
 *   - `/api/auth/oauth-provision` (first-time Google/Apple sign-in)
 *   - `/api/auth/repair-workspace` (self-heal for an authenticated user
 *     with no tenancy — `uid` may already have a `users/{uid}` doc here,
 *     which is why the write below merges rather than overwrites)
 *
 * Extracted so every call site stays behavior-identical instead of
 * drifting. Caller is responsible for creating the Firebase Auth user
 * FIRST and deleting it on failure — this function assumes `uid` already
 * exists.
 */

export interface ProvisionNewAgencyInput {
  uid: string;
  email: string;
  displayName: string;
  /**
   * True only for the very first signup on a fresh deployment — stamps the
   * singleton `appConfig/main` doc that marks this user as the bootstrap
   * agency owner. Every other caller passes false; public registrations and
   * paid self-serve signups create independent agencies and must never
   * overwrite that singleton.
   */
  bootstrap: boolean;
  /**
   * Stamps `requiresEmailVerification: true` on the custom claims, which
   * middleware.ts uses to redirect to /verify-email until the address is
   * confirmed. MUST be `false` for `/api/auth/repair-workspace` — that path
   * fixes tenancy for a Firebase Auth user who may have been active for a
   * long time already; stamping it there would suddenly lock out an
   * existing account that was never asked to verify. Every genuinely new
   * account-creation path (signup, claim-subscription, oauth-provision)
   * passes `true`.
   */
  requiresEmailVerification: boolean;
}

export interface ProvisionNewAgencyResult {
  agencyId: string;
  subAccountId: string;
}

export async function provisionNewAgency(
  input: ProvisionNewAgencyInput,
): Promise<ProvisionNewAgencyResult> {
  const { uid, email, displayName, bootstrap, requiresEmailVerification } = input;
  const db = getAdminDb();
  const auth = getAdminAuth();

  const agencyRef = db.collection("agencies").doc();
  const subAccountRef = db.collection("subAccounts").doc();
  const agencyId = agencyRef.id;
  const subAccountId = subAccountRef.id;
  const agencyName = `${displayName || email.split("@")[0]}'s Agency`;

  await auth.setCustomUserClaims(uid, {
    // Legacy claim — still consumed by the existing dashboard pages until
    // Phase 2 swaps them out. agencyOwner == admin everywhere.
    role: "admin" as Role,
    status: "active",
    // Agency-model claims.
    agencyId,
    agencyRole: "owner",
    ...(requiresEmailVerification ? { requiresEmailVerification: true } : {}),
  });

  const batch = db.batch();

  // Merge, not overwrite — a repair call (see /api/auth/repair-workspace)
  // can hit this for a user doc that already exists but is only missing
  // tenancy fields. A plain set() would clobber real billing/profile state
  // (stripeCustomerId, subscriptionStatus, photoURL, …) back to defaults.
  batch.set(
    db.doc(`users/${uid}`),
    {
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
    },
    { merge: true },
  );

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

  batch.set(agencyRef.collection("agencyMembers").doc(uid), {
    uid,
    agencyId,
    role: "owner",
    status: "active",
    email,
    displayName,
    addedAt: FieldValue.serverTimestamp(),
    addedByUid: uid,
  });

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
    websiteStudioEnabledByAgency: false,
    communityEnabledByAgency: false,
    idxEnabledByAgency: false,
    metaConfig: null,
    bookingConfig: null,
    sendWindow: null,
    bookingLink: null,
    replyToEmail: null,
    automationsPaused: false,
  });

  // Seed the per-agency counter so the next sub-account picks up at 1001.
  // Lives at agencies/{agencyId}/counters/subAccount; mutated exclusively by
  // /api/agency/sub-accounts inside a transaction.
  batch.set(agencyRef.collection("counters").doc("subAccount"), { next: 1001 });

  batch.set(subAccountRef.collection("subAccountMembers").doc(uid), {
    uid,
    subAccountId,
    agencyId,
    role: "admin",
    status: "active",
    email,
    displayName,
    addedAt: FieldValue.serverTimestamp(),
    addedByUid: uid,
    // Default to Global so the member sees everything if scoping is later
    // enabled before the admin carves out territories. (Owners/admins are
    // exempt at runtime anyway.)
    assignedTerritoryIds: [GLOBAL_TERRITORY_ID],
  });

  // Per-user denormalized index, used by the sub-account switcher.
  batch.set(db.doc(`userMemberships/${uid}/agencies/${agencyId}`), {
    agencyId,
    role: "owner",
    name: agencyName,
  });
  batch.set(db.doc(`userMemberships/${uid}/subAccounts/${subAccountId}`), {
    subAccountId,
    agencyId,
    accountNumber: 1000,
    role: "admin",
    name: "Main",
    addedAt: FieldValue.serverTimestamp(),
  });

  // appConfig/main identifies only the first bootstrap owner. Every other
  // caller creates an independent agency and must never overwrite it.
  if (bootstrap) {
    batch.set(db.doc("appConfig/main"), {
      adminUid: uid,
      adminEmail: email,
      firstAgencyId: agencyId,
      firstAgencyOwnerUid: uid,
      bootstrapEmail: email,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // Seed Welcome email + Welcome SMS templates into the new sub-account so
  // the agency owner sees usable defaults the first time they open
  // Automations → Templates.
  seedDefaultTemplates(db, (ref, data) => batch.set(ref, data), {
    agencyId,
    subAccountId,
    createdByUid: uid,
  });

  // Seed the four Method Templates as ACTIVE workflows — every new
  // workspace inherits missed-call textback, new-lead instant response,
  // post-closing review request, and cold-lead 90-day revival from day one.
  seedMethodTemplates(db, (ref, data) => batch.set(ref, data), {
    agencyId,
    subAccountId,
    createdByUid: uid,
  });

  await batch.commit();

  return { agencyId, subAccountId };
}
