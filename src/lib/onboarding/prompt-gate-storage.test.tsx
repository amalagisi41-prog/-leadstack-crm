import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The gate's persistence: dismissal must survive navigation (same session),
 * a new browser session (sessionStorage gone), and another device (only the
 * users/{uid} copy survives).
 */

const server = vi.hoisted(() => ({ users: {} as Record<string, Record<string, unknown>> }));

vi.mock("@/lib/firebase/client", () => ({ getFirebaseDb: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: async (ref: { id: string }) => ({ data: () => server.users[ref.id] }),
  updateDoc: async (ref: { id: string }, data: Record<string, unknown>) => {
    server.users[ref.id] = { ...(server.users[ref.id] ?? {}), ...data };
  },
}));

import {
  markOnboardingCompleted,
  markPromptDismissed,
  markPromptShownThisSession,
  readPromptGate,
} from "./prompt-gate-storage";
import { canAutoOpenOnboardingPrompt } from "./prompt-gate";

const DAY = 24 * 60 * 60 * 1000;
const UID = "user-1";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  server.users = {};
});

describe("onboarding prompt gate persistence", () => {
  it("after it opens once, navigating to another page does not re-open it", async () => {
    expect(canAutoOpenOnboardingPrompt(await readPromptGate(UID), Date.now())).toBe(true);
    markPromptShownThisSession(UID);
    // Each page navigation re-reads the gate.
    for (let page = 0; page < 5; page++) {
      expect(canAutoOpenOnboardingPrompt(await readPromptGate(UID), Date.now())).toBe(false);
    }
  });

  it("X ('not now') suppresses it across a new session for 7 days", async () => {
    const t = Date.now();
    await markPromptDismissed(UID, t);
    window.sessionStorage.clear(); // a new browser session
    const gate = await readPromptGate(UID);
    expect(gate.shownThisSession).toBe(false);
    expect(canAutoOpenOnboardingPrompt(gate, t + 2 * DAY)).toBe(false);
    expect(canAutoOpenOnboardingPrompt(gate, t + 7 * DAY + 1)).toBe(true);
  });

  it("persists per user: the dismissal follows the user to another device", async () => {
    const t = Date.now();
    await markPromptDismissed(UID, t);
    expect(server.users[UID]?.onboardingPromptDismissedAt).toBe(t);
    window.localStorage.clear(); // another device: only the server copy exists
    window.sessionStorage.clear();
    const gate = await readPromptGate(UID);
    expect(gate.dismissedAt).toBe(t);
    expect(canAutoOpenOnboardingPrompt(gate, t + DAY)).toBe(false);
  });

  it("is per user: one user's dismissal does not silence another's", async () => {
    await markPromptDismissed(UID, Date.now());
    expect(canAutoOpenOnboardingPrompt(await readPromptGate("user-2"), Date.now())).toBe(true);
  });

  it("completion stops it for good, on every device", async () => {
    await markOnboardingCompleted(UID, 123);
    window.localStorage.clear();
    window.sessionStorage.clear();
    const gate = await readPromptGate(UID);
    expect(gate.completedAt).toBe(123);
    expect(canAutoOpenOnboardingPrompt(gate, Date.now() + 365 * DAY)).toBe(false);
  });
});
