import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeForLongLivedUserToken } from "./meta";

describe("exchangeForLongLivedUserToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests the fb_exchange_token grant and returns the long-lived token", async () => {
    vi.stubEnv("META_APP_ID", "app-123");
    vi.stubEnv("META_APP_SECRET", "secret-456");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "long-lived-token", expires_in: 5183944 }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeForLongLivedUserToken("short-lived-token"),
    ).resolves.toEqual({
      accessToken: "long-lived-token",
      expiresInSeconds: 5183944,
    });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("grant_type")).toBe("fb_exchange_token");
    expect(calledUrl.searchParams.get("fb_exchange_token")).toBe(
      "short-lived-token",
    );
    expect(calledUrl.searchParams.get("client_id")).toBe("app-123");
    expect(calledUrl.searchParams.get("client_secret")).toBe("secret-456");
  });

  it("throws when Meta returns a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 400 })),
    );
    await expect(
      exchangeForLongLivedUserToken("short-lived-token"),
    ).rejects.toThrow(/Meta long-lived token exchange failed/);
  });

  it("throws when the response has no access_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );
    await expect(
      exchangeForLongLivedUserToken("short-lived-token"),
    ).rejects.toThrow(/no token/);
  });
});
