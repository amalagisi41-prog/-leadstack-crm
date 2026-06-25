import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Load .env.local manually (no dotenv dependency assumed)
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]] = v;
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore();
const targetEmail = process.argv[2];

const snap = await db.collection("purchases").where("email", "==", targetEmail).get();

if (snap.empty) {
  console.log(`No purchases doc with email == ${targetEmail}`);
  process.exit(0);
}

function ts(v) {
  if (!v) return "(none)";
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  return String(v);
}

for (const doc of snap.docs) {
  const d = doc.data();
  console.log("sessionId:", doc.id);
  console.log("  email:", d.email);
  console.log("  githubUsername:", d.githubUsername ?? "(none submitted)");
  console.log("  githubInviteStatus:", d.githubInviteStatus ?? "(none)");
  console.log("  githubInviteCount:", d.githubInviteCount ?? 0);
  console.log("  githubInviteError:", d.githubInviteError ?? null);
  console.log("  amount:", d.amount ?? d.amountTotal ?? "(n/a)", d.currency ?? "");
  console.log("  createdAt (purchase):", ts(d.createdAt));
  console.log("  githubInviteSentAt (access granted):", ts(d.githubInviteSentAt));
  console.log("  setupEmailSentAt:", ts(d.setupEmailSentAt));
  console.log("  setupEmailMessageId:", d.setupEmailMessageId ?? "(none)");
  console.log("  ALL FIELDS:", JSON.stringify(d, null, 2));
  console.log("---");
}
process.exit(0);
