import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { seedDefaultTemplates } from "@/lib/automations/seed-templates";
import { GLOBAL_TERRITORY_ID, type Role } from "@/types";

export async function provisionBetaOwner({
  auth,
  db,
  uid,
  email,
  displayName,
  bootstrap,
}: {
  auth: Auth;
  db: Firestore;
  uid: string;
  email: string;
  displayName: string;
  bootstrap: boolean;
}) {
  const agencyRef = db.collection("agencies").doc();
  const subAccountRef = db.collection("subAccounts").doc();
  const agencyId = agencyRef.id;
  const subAccountId = subAccountRef.id;
  const agencyName = `${displayName || email.split("@")[0]}'s Agency`;

  await auth.setCustomUserClaims(uid, {
    role: "admin" as Role,
    status: "active",
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
    metaConfig: null,
    bookingConfig: null,
    sendWindow: null,
    bookingLink: null,
    replyToEmail: null,
    automationsPaused: false,
  });
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
    assignedTerritoryIds: [GLOBAL_TERRITORY_ID],
  });
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
  seedDefaultTemplates(db, (ref, data) => batch.set(ref, data), {
    agencyId,
    subAccountId,
    createdByUid: uid,
  });
  await batch.commit();
  return { agencyId, subAccountId };
}
