import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildGhlAuthorizeUrl,
  ghlOAuthConfigured,
  signGhlState,
  verifyGhlState,
} from "./oauth";

const original = { ...process.env };

beforeEach(() => {
  process.env.AUTOMATIONS_TOKEN_SECRET = "test-secret-with-enough-entropy";
  process.env.GHL_CLIENT_ID = "client-123";
  process.env.GHL_CLIENT_SECRET = "secret-456";
});

afterEach(() => {
  process.env = { ...original };
});

describe("HighLevel OAuth", () => {
  it("requires server credentials before exposing login", () => {
    expect(ghlOAuthConfigured()).toBe(true);
    delete process.env.GHL_CLIENT_SECRET;
    expect(ghlOAuthConfigured()).toBe(false);
  });

  it("round-trips a signed workspace and user state", () => {
    const state = signGhlState("sa-1", "user-1", "nonce-1");
    expect(verifyGhlState(state)).toEqual({
      subAccountId: "sa-1",
      uid: "user-1",
    });
    expect(verifyGhlState(`${state}tampered`)).toBeNull();
  });

  it("builds a location login URL with callback and least-privilege scopes", () => {
    const url = new URL(
      buildGhlAuthorizeUrl("https://agentstackcrm.app/api/ghl/callback", "signed-state"),
    );
    expect(url.hostname).toBe("marketplace.gohighlevel.com");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toContain("contacts.readonly");
  });
});
