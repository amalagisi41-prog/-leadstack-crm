import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchApprovedMlsIds, fetchIdxListings } from "./broker-client";

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
});
