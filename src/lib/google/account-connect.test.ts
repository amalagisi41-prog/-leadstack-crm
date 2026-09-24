import { beforeAll, describe, expect, it } from "vitest";
import {
  buildGoogleAccountAuthUrl,
  GOOGLE_ACCOUNT_SCOPES,
  signGoogleAccountState,
  verifyGoogleAccountState,
} from "./account-connect";
import {
  signGoogleOAuthState,
  verifyGoogleOAuthState,
} from "@/lib/comms/google-oauth-state";

beforeAll(() => {
  process.env.AUTOMATIONS_TOKEN_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://agentstackcrm.app/";
});

describe("Google Profile account-connect state", () => {
  it("round-trips the sub-account id", () => {
    expect(verifyGoogleAccountState(signGoogleAccountState("sa_1", "n"))).toEqual({
      subAccountId: "sa_1",
      returnTo: "connect",
    });
    expect(
      verifyGoogleAccountState(signGoogleAccountState("sa_1", "n", "calendar")),
    ).toEqual({
      subAccountId: "sa_1",
      returnTo: "calendar",
    });
  });

  it("rejects a tampered sub-account id", () => {
    const state = signGoogleAccountState("sa_1", "n").replace("sa_1", "sa_2");
    expect(verifyGoogleAccountState(state)).toBeNull();
  });

  it("never cross-validates with the Business Profile import state", () => {
    expect(verifyGoogleAccountState(signGoogleOAuthState("sa_1", "n"))).toBeNull();
    expect(verifyGoogleOAuthState(signGoogleAccountState("sa_1", "n"))).toBeNull();
  });
});

describe("buildGoogleAccountAuthUrl", () => {
  it("uses the already-registered redirect URI and asks for every Google scope once", () => {
    const url = new URL(buildGoogleAccountAuthUrl("sa_1", "client-123"));
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://agentstackcrm.app/api/oauth/google/callback",
    );
    expect(url.searchParams.get("scope")).toBe(GOOGLE_ACCOUNT_SCOPES.join(" "));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(verifyGoogleAccountState(url.searchParams.get("state") ?? "")).toEqual({
      subAccountId: "sa_1",
      returnTo: "connect",
    });
  });
});
