import "server-only";

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let _app: App | null = null;

function getAdminApp(): App {
  if (!_app) {
    if (getApps().length > 0) {
      _app = getApps()[0];
    } else {
      _app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
            /\\n/g,
            "\n"
          ),
        }),
      });
    }
  }
  return _app;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  const db = getFirestore(getAdminApp());
  // ignoreUndefinedProperties: skip undefined values on writes instead of
  // throwing. Defends against the easy mistake of `meta: { foo: x ?? undefined }`
  // which crashes the whole request. settings() can only be called once per
  // Firestore instance and must run before any other call; in Next.js dev,
  // hot-reload kicks the module state but the Firestore instance persists,
  // so subsequent calls throw "already initialized" — swallow that path.
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already configured on a prior import; nothing to do.
  }
  return db;
}
