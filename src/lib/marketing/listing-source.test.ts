import { describe, expect, it } from "vitest";
import {
  describeListingSource,
  isMarketingStatus,
  MARKETING_STATUS_TO_IDX_STATUS,
  resolveMarketingStatus,
} from "./listing-source";

describe("describeListingSource", () => {
  it("treats an unstamped record as the MLS feed", () => {
    // The sync job is the only writer that doesn't stamp `importedFrom`.
    expect(describeListingSource({ raw: {} })).toMatchObject({
      key: "mls",
      isFeedSourced: true,
    });
  });

  it("recognizes guided manual entry as the off-market path", () => {
    expect(
      describeListingSource({ raw: { importedFrom: "guided manual entry" } })
    ).toMatchObject({ key: "manual", isFeedSourced: false });
  });

  it("treats any other stamped origin as an import", () => {
    expect(
      describeListingSource({ raw: { importedFrom: "listing upload" } })
    ).toMatchObject({ key: "imported", isFeedSourced: false });
  });

  it("never claims MLS display rights for a record it cannot read", () => {
    // A brief whose listing doc is gone must not inherit "MLS feed", or the
    // composer would offer a verbatim disclaimer it has no source for.
    for (const listing of [null, undefined]) {
      expect(describeListingSource(listing).isFeedSourced).toBe(false);
    }
  });

  it("ignores a non-string importedFrom rather than trusting it", () => {
    expect(describeListingSource({ raw: { importedFrom: 42 } }).key).toBe(
      "mls"
    );
    expect(describeListingSource({ raw: { importedFrom: null } }).key).toBe(
      "mls"
    );
  });
});

describe("resolveMarketingStatus", () => {
  it("prefers the operator-set lifecycle over the feed status", () => {
    expect(
      resolveMarketingStatus({ status: "active", marketingStatus: "new" })
    ).toBe("new");
  });

  it("derives a lifecycle for legacy docs that predate the field", () => {
    expect(resolveMarketingStatus({ status: "pending" })).toBe(
      "under-contract"
    );
    expect(resolveMarketingStatus({ status: "sold" })).toBe("just-sold");
    expect(resolveMarketingStatus({ status: "off-market" })).toBe("off-market");
    expect(resolveMarketingStatus({ status: "active" })).toBe("active");
  });

  it("round-trips every lifecycle back through the feed-shaped status", () => {
    // Guided entry writes both fields from one choice; the status PATCH route
    // rewrites both too. They must agree, or a saved "off market" property
    // reappears as active on the next read.
    for (const [marketing, idx] of Object.entries(
      MARKETING_STATUS_TO_IDX_STATUS
    )) {
      const resolved = resolveMarketingStatus({
        status: idx,
        marketingStatus: marketing as never,
      });
      expect(resolved).toBe(marketing);
    }
  });
});

describe("isMarketingStatus", () => {
  it("accepts the shipped lifecycle values", () => {
    expect(isMarketingStatus("off-market")).toBe(true);
    expect(isMarketingStatus("under-contract")).toBe(true);
  });

  it("rejects feed-only statuses and junk", () => {
    // "pending" and "sold" are feed vocabulary, not operator choices.
    expect(isMarketingStatus("pending")).toBe(false);
    expect(isMarketingStatus("sold")).toBe(false);
    expect(isMarketingStatus("")).toBe(false);
    expect(isMarketingStatus(undefined)).toBe(false);
    expect(isMarketingStatus("constructor")).toBe(false);
  });
});
