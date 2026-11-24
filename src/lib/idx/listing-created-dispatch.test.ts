import { describe, expect, it, vi } from "vitest";
import {
  draftCampaignsForNewListings,
  listingsEligibleForAutoDraft,
} from "./listing-created-dispatch";
import type { IdxListingDoc } from "@/types/idx";

function listing(overrides: Record<string, unknown>): IdxListingDoc {
  return {
    id: "l1",
    subAccountId: "sa1",
    mlsId: "d028",
    status: "active",
    price: 500000,
    address: "123 Main St",
    city: "Hartford",
    state: "CT",
    zip: "06103",
    beds: 3,
    baths: 2,
    sqft: 1800,
    yearBuilt: 2005,
    propertyType: "Single Family",
    photos: ["https://example.test/photo.jpg"],
    remarks: "Lovely home",
    listingAgentName: null,
    listingOfficeName: null,
    disclaimer: "MLS data provided by Smart MLS",
    lat: null,
    lng: null,
    raw: {},
    syncedAt: null,
    ...overrides,
  } as unknown as IdxListingDoc;
}

/** A hand-rolled fake covering only the doc().get()/set() calls the dispatcher makes. */
function fakeDb(existingIds: Set<string> = new Set()) {
  const writes: { path: string; payload: unknown }[] = [];
  const doc = vi.fn((path: string) => ({
    get: vi.fn(async () => {
      const id = path.split("/").pop();
      return { exists: existingIds.has(id ?? "") };
    }),
    set: vi.fn(async (payload: unknown) => {
      writes.push({ path, payload });
    }),
  }));
  return { doc, writes } as unknown as { doc: typeof doc; writes: typeof writes };
}

describe("listingsEligibleForAutoDraft", () => {
  it("keeps only active listings — a new pending or off-market row has nothing to promote yet", () => {
    const listings = [
      listing({ id: "a", status: "active" }),
      listing({ id: "b", status: "pending" }),
      listing({ id: "c", status: "off-market" }),
      listing({ id: "d", status: "sold" }),
    ];
    const result = listingsEligibleForAutoDraft(listings);
    expect(result.map((l) => l.id)).toEqual(["a"]);
  });
});

describe("draftCampaignsForNewListings", () => {
  it("drafts a brief for each new active listing and reports the count", async () => {
    const db = fakeDb();
    const listings = [listing({ id: "new-1" }), listing({ id: "new-2" })];

    const result = await draftCampaignsForNewListings(
      db as unknown as import("firebase-admin/firestore").Firestore,
      "sa1",
      "agency1",
      listings
    );

    expect(result.drafted).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(db.writes).toHaveLength(2);
    const payload = db.writes[0].payload as Record<string, unknown>;
    expect(payload.createdByUid).toBe("system:idx-auto-draft");
    expect(payload.approvedChannels).toEqual([]);
  });

  it("never overwrites a campaign brief that already exists for that listing id", async () => {
    const db = fakeDb(new Set(["already-has-brief"]));
    const result = await draftCampaignsForNewListings(
      db as unknown as import("firebase-admin/firestore").Firestore,
      "sa1",
      "agency1",
      [listing({ id: "already-has-brief" })]
    );
    expect(result.drafted).toBe(0);
    expect(db.writes).toHaveLength(0);
  });

  it("skips non-active listings entirely", async () => {
    const db = fakeDb();
    const result = await draftCampaignsForNewListings(
      db as unknown as import("firebase-admin/firestore").Firestore,
      "sa1",
      "agency1",
      [listing({ id: "pending-1", status: "pending" })]
    );
    expect(result.drafted).toBe(0);
    expect(db.writes).toHaveLength(0);
  });

  it("records a per-listing error without failing the whole batch", async () => {
    const existingIds = new Set<string>();
    const writes: unknown[] = [];
    const db = {
      doc: vi.fn((path: string) => ({
        get: vi.fn(async () => {
          const id = path.split("/").pop();
          if (id === "boom") throw new Error("Firestore write failed");
          return { exists: existingIds.has(id ?? "") };
        }),
        set: vi.fn(async (payload: unknown) => {
          writes.push(payload);
        }),
      })),
    };

    const result = await draftCampaignsForNewListings(
      db as unknown as import("firebase-admin/firestore").Firestore,
      "sa1",
      "agency1",
      [listing({ id: "boom" }), listing({ id: "fine" })]
    );

    expect(result.drafted).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("boom");
  });
});
