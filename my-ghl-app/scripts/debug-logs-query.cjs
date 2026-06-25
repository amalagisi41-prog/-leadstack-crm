// Throwaway debug: reproduce the Logs → Webhooks query against Firestore.
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

async function main() {
  // List a few sub-accounts to grab a real id.
  const subs = await db.collection("subAccounts").limit(10).get();
  console.log("sub-accounts:", subs.docs.map((d) => `${d.id} (${d.data().name ?? "?"})`));

  for (const sub of subs.docs) {
    const subAccountId = sub.id;
    try {
      const snap = await db
        .collection("subAccounts")
        .doc(subAccountId)
        .collection("webhookEvents")
        .orderBy("createdAt", "desc")
        .limit(30)
        .get();
      console.log(`OK webhookEvents ${subAccountId}: ${snap.size} docs`);
    } catch (err) {
      console.error(`THREW webhookEvents ${subAccountId}:`, err.code, err.message);
    }
    try {
      const snap = await db
        .collection("subAccounts")
        .doc(subAccountId)
        .collection("apiRequestLogs")
        .orderBy("createdAt", "desc")
        .limit(30)
        .get();
      console.log(`OK apiRequestLogs ${subAccountId}: ${snap.size} docs`);
    } catch (err) {
      console.error(`THREW apiRequestLogs ${subAccountId}:`, err.code, err.message);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
