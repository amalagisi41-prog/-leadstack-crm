"use client";

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { PromptGateState } from "./prompt-gate";

/**
 * Where the onboarding-prompt gate is remembered, per user:
 *
 * - sessionStorage: "a modal already opened on its own this session";
 * - localStorage: dismissal / completion, so the answer is instant on load;
 * - users/{uid}: the same two timestamps, so they follow the user to another
 *   browser or device (users may update their own doc — firestore.rules).
 *
 * Every storage access is wrapped: private windows and blocked storage just
 * fall back to the server copy, never throw.
 */

const SESSION_KEY = (uid: string) => `as:onboarding-prompt-shown:${uid}`;
const DISMISSED_KEY = (uid: string) => `as:onboarding-prompt-dismissed-at:${uid}`;
const COMPLETED_KEY = (uid: string) => `as:onboarding-completed-at:${uid}`;

/** Fired on window whenever the gate changes, so other surfaces re-read it. */
export const PROMPT_GATE_EVENT = "as:onboarding-prompt-gate";

function read(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage blocked: the users/{uid} copy still records it.
  }
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : v ? Number(v) || null : null;

const local = () => (typeof window === "undefined" ? undefined : window.localStorage);
const session = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

/** The gate as known locally, without waiting on the network. */
export function readLocalPromptGate(uid: string): PromptGateState {
  return {
    shownThisSession: read(session(), SESSION_KEY(uid)) === "1",
    dismissedAt: num(read(local(), DISMISSED_KEY(uid))),
    completedAt: num(read(local(), COMPLETED_KEY(uid))),
  };
}

/** Local state merged with the user's server copy (latest timestamp wins). */
export async function readPromptGate(uid: string): Promise<PromptGateState> {
  const state = readLocalPromptGate(uid);
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "users", uid));
    const data = snap.data() as
      | { onboardingPromptDismissedAt?: number; onboardingCompletedAt?: number }
      | undefined;
    const dismissed = num(data?.onboardingPromptDismissedAt);
    const completed = num(data?.onboardingCompletedAt);
    if (dismissed && dismissed > (state.dismissedAt ?? 0)) {
      state.dismissedAt = dismissed;
      write(local(), DISMISSED_KEY(uid), String(dismissed));
    }
    if (completed && !state.completedAt) {
      state.completedAt = completed;
      write(local(), COMPLETED_KEY(uid), String(completed));
    }
  } catch {
    // Offline or rules-denied: the local copy stands.
  }
  return state;
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROMPT_GATE_EVENT));
}

export function markPromptShownThisSession(uid: string) {
  write(session(), SESSION_KEY(uid), "1");
  announce();
}

async function saveToUser(uid: string, data: Record<string, number>) {
  try {
    await updateDoc(doc(getFirebaseDb(), "users", uid), data);
  } catch {
    // The local copy still suppresses the prompt on this device.
  }
}

/** "Not now": suppressed for this session and the next 7 days. */
export async function markPromptDismissed(uid: string, now = Date.now()) {
  write(session(), SESSION_KEY(uid), "1");
  write(local(), DISMISSED_KEY(uid), String(now));
  announce();
  await saveToUser(uid, { onboardingPromptDismissedAt: now });
}

/** Onboarding finished: the modal never opens on its own again. */
export async function markOnboardingCompleted(uid: string, now = Date.now()) {
  if (readLocalPromptGate(uid).completedAt) return;
  write(local(), COMPLETED_KEY(uid), String(now));
  announce();
  await saveToUser(uid, { onboardingCompletedAt: now });
}
