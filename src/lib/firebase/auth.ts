import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "./client";

export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(
    getFirebaseAuth(),
    email,
    password,
  );
  await createSessionCookie(credential.user);
  return credential;
}

export async function signUpWithEmail(email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(
    getFirebaseAuth(),
    email,
    password,
  );
  await createSessionCookie(credential.user);
  return credential;
}

export interface SocialAuthResult {
  redirectTo: string;
  existing: boolean;
}

async function signInWithSocialProvider(
  provider: GoogleAuthProvider | OAuthProvider,
): Promise<SocialAuthResult> {
  const credential = await signInWithPopup(getFirebaseAuth(), provider);
  const idToken = await credential.user.getIdToken();
  const response = await fetch("/api/auth/oauth-provision", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    redirectTo?: string;
    existing?: boolean;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not finish social sign-in.");
  }

  // Provisioning sets tenancy claims for first-time users. Force-refresh the
  // ID token before exchanging it for the middleware session cookie.
  await credential.user.getIdToken(true);
  await createSessionCookie(credential.user);
  return {
    redirectTo: payload.redirectTo ?? "/dashboard",
    existing: payload.existing ?? false,
  };
}

export function signInWithGoogle(): Promise<SocialAuthResult> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithSocialProvider(provider);
}

export function signInWithApple(): Promise<SocialAuthResult> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return signInWithSocialProvider(provider);
}

export async function signOutUser() {
  await fetch("/api/logout", { method: "GET" }).catch((err) =>
    console.warn("logout endpoint failed", err),
  );
  return signOut(getFirebaseAuth());
}

/**
 * Send a Firebase password-reset email. The link in the email lands on
 * Firebase's hosted action handler which lets the user pick a new
 * password. Always resolves to void on the client side — Firebase doesn't
 * tell us whether the address exists (by design, to avoid email
 * enumeration). UI should show the same success message regardless.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email);
}

/**
 * Change the current user's password. Firebase requires recent auth for
 * sensitive changes — we re-authenticate first with the user's current
 * password, then update. On a stale session this surfaces a clear
 * auth/wrong-password error instead of the confusing
 * auth/requires-recent-login that updatePassword would otherwise throw.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("Not signed in.");
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

/**
 * Exchange the Firebase ID token for the __session cookie that
 * next-firebase-auth-edge middleware uses to gate protected routes.
 */
async function createSessionCookie(user: User): Promise<void> {
  const idToken = await user.getIdToken();
  const res = await fetch("/api/login", {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    throw new Error(
      `Session cookie request failed: ${res.status} ${res.statusText}`,
    );
  }
}
