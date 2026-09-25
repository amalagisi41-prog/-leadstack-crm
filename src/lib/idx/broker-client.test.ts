import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAccountInfo,
  fetchAgents,
  fetchApprovedMlsIds,
  fetchIdxListings,
  fetchSavedLinks,
  fetchSupplementalListings,
  extractListingsFromSavedLink,
} from "./broker-client";

describe("IDX Broker featured listings client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns MLS IDs rather than array indexes from approved-MLS responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(["22904"]), { status: 200 }),
      ),
    );

    await expect(fetchApprovedMlsIds("test-access-key")).resolves.toEqual([
      "22904",
    ]);
  });

  it("extracts the ID from structured approved-MLS records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: 22904, name: "SmartMLS" }]), {
          status: 200,
        }),
      ),
    );

    await expect(fetchApprovedMlsIds("test-access-key")).resolves.toEqual([
      "22904",
    ]);
  });

  it("requests the official featured-listings endpoint and ignores response metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          "a000!%123": {
            listingID: "123",
            address: "1 Main Street",
          },
          totalCount: "1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchIdxListings("test-access-key")).resolves.toEqual([
      { listingID: "123", address: "1 Main Street" },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.idxbroker.com/clients/featured",
      {
        headers: { accesskey: "test-access-key", outputtype: "json" },
      },
    );
  });

  it("surfaces the featured-listings HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 400 })),
    );

    await expect(fetchIdxListings("test-access-key")).rejects.toMatchObject({
      message: "IDX Broker featured listings request failed (HTTP 400).",
      status: 400,
    });
  });

  it("accepts array and envelope responses with common listing ID aliases", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [{ listingNumber: "10000001", address: "123 Main Street" }] }), { status: 200 }),
      ),
    );
    await expect(fetchIdxListings("test-access-key")).resolves.toEqual([
      { listingNumber: "10000001", address: "123 Main Street" },
    ]);
  });

  it("treats 204 as intentionally zero listings, not a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(fetchIdxListings("test-access-key")).resolves.toEqual([]);
  });

  it("throws instead of silently returning zero listings when a 200 response isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>not json</html>", { status: 200 }),
      ),
    );
    await expect(fetchIdxListings("test-access-key")).rejects.toMatchObject({
      message: expect.stringContaining("wasn't valid JSON"),
      status: 200,
    });
  });

  it("passes interval and agentID as query params on the featured request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchIdxListings("test-access-key", {
      intervalHours: 8765,
      agentMlsId: "AGT123",
    });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/clients/featured");
    expect(calledUrl.searchParams.get("interval")).toBe("8765");
    expect(calledUrl.searchParams.get("agentID")).toBe("AGT123");
  });

  it("reads the connected account's id from accountinfo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accountID: "acct-42", accountName: "Casey's Property Group" }), { status: 200 }),
      ),
    );
    await expect(fetchAccountInfo("test-access-key")).resolves.toEqual({
      accountId: "acct-42",
      accountName: "Casey's Property Group",
      raw: { accountID: "acct-42", accountName: "Casey's Property Group" },
    });
  });

  it("surfaces an accountinfo auth failure instead of a blank account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(fetchAccountInfo("bad-key")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("extracts agent MLS ids from the agents list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([{ agentID: "1", agentMLSID: "15903863", agentName: "Seamus Costigan" }]),
          { status: 200 },
        ),
      ),
    );
    await expect(fetchAgents("test-access-key")).resolves.toEqual([
      {
        agentId: "1",
        agentMlsId: "15903863",
        name: "Seamus Costigan",
        raw: { agentID: "1", agentMLSID: "15903863", agentName: "Seamus Costigan" },
      },
    ]);
  });

  it("lists saved links without guessing a results endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "42", name: "Active listings", url: "https://example.com/s/42" }]), { status: 200 }),
      ),
    );
    const links = await fetchSavedLinks("test-access-key");
    expect(links).toEqual([
      {
        id: "42",
        name: "Active listings",
        url: "https://example.com/s/42",
        raw: { id: "42", name: "Active listings", url: "https://example.com/s/42" },
      },
    ]);
    // No listings embedded in this saved-link record → zero, not an error.
    expect(extractListingsFromSavedLink(links[0])).toEqual([]);
  });

  it("extracts embedded listings from a saved link's own payload when present", () => {
    const link = {
      id: "42",
      name: "Active listings",
      url: null,
      raw: { listings: [{ listingID: "L1", address: "1 Main St" }] },
    };
    expect(extractListingsFromSavedLink(link)).toEqual([
      { listingID: "L1", address: "1 Main St" },
    ]);
  });

  it("requests supplemental listings from the dedicated endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ listingID: "SUP1", address: "2 Off MLS Way" }]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSupplementalListings("test-access-key")).resolves.toEqual([
      { listingID: "SUP1", address: "2 Off MLS Way" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.idxbroker.com/clients/supplemental",
      { headers: { accesskey: "test-access-key", outputtype: "json" } },
    );
  });
});
