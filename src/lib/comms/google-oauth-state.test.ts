import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";

import {
  signGoogleOAuthState,
  verifyGoogleOAuthState,
} from "./google-oauth-state";

/**
 * These guard the CSRF state used by BOTH Google flows — the Gmail sending
 * connection and the Business Profile import.
 *
 * The Business Profile flow previously had a "verifier" that took
 * (sentState, expectedState) and was called as `verify(state, state)` — the
 * same string twice — so it reduced to "is this non-empty" and returned true
 * for anything an attacker supplied. Its callback then trusted the
 * sub-account id parsed out of that unverified string, which made the flow an
 * OAuth code-injection vector: an attacker could have their own Google
 * Business Profile imported into someone else's workspace.
 *
 * The tests below assert the properties that actually stop that: a forged
 * state must not verify, and a state minted for one sub-account must not be
 * usable to name a different one.
 */

beforeAll(() => {
  process.env.AUTOMATIONS_TOKEN_SECRET = "test-secret-for-state-signing";
});

describe("signGoogleOAuthState / verifyGoogleOAuthState", () => {
  it("round-trips the sub-account id", () => {
    const state = signGoogleOAuthState("sa_abc123", "nonce1");
    expect(verifyGoogleOAuthState(state)).toEqual({ subAccountId: "sa_abc123" });
  });

  it("rejects a hand-crafted state naming a victim sub-account", () => {
    // Exactly the old format: `${subAccountId}:${Math.random()...}` — trivially
    // forgeable, and the old code accepted it.
    expect(verifyGoogleOAuthState("sa_victim:abc123")).toBeNull();
  });

  it("rejects a state whose signature does not match its payload", () => {
    const state = signGoogleOAuthState("sa_attacker", "nonce1");
    const [, nonce, sig] = state.split(".");
    // Swap in a different sub-account, keep the valid-looking signature.
    expect(verifyGoogleOAuthState(`sa_victim.${nonce}.${sig}`)).toBeNull();
  });

  it("rejects a tampered nonce", () => {
    const state = signGoogleOAuthState("sa_abc123", "nonce1");
    const [sub, , sig] = state.split(".");
    expect(verifyGoogleOAuthState(`${sub}.tampered.${sig}`)).toBeNull();
  });

  it("rejects malformed states without throwing", () => {
    for (const bad of ["", "a", "a.b", "a.b.c.d", "....", "not-a-state"]) {
      expect(verifyGoogleOAuthState(bad)).toBeNull();
    }
  });

  it("produces a different signature per nonce", () => {
    const a = signGoogleOAuthState("sa_abc123", "nonce1");
    const b = signGoogleOAuthState("sa_abc123", "nonce2");
    expect(a).not.toBe(b);
    // Both still verify to the same sub-account.
    expect(verifyGoogleOAuthState(a)).toEqual(verifyGoogleOAuthState(b));
  });

  it("does not validate a state signed for the Meta flow", () => {
    // Domain separation: the Meta signer uses a `metastate:` prefix, so a
    // signature minted there must not pass here even with the same secret.
    const payload = "sa_abc123.nonce1";
    const metaSig = crypto
      .createHmac("sha256", process.env.AUTOMATIONS_TOKEN_SECRET!)
      .update(`metastate:${payload}`)
      .digest("hex");
    expect(verifyGoogleOAuthState(`${payload}.${metaSig}`)).toBeNull();
  });
});
