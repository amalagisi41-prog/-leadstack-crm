import { createHash } from "node:crypto";

/**
 * Address-based identity for a listing that has no MLS/listing number of its
 * own — a manually uploaded off-market property, or one pulled from a public
 * listings page.
 *
 * Every write into `idxListings` that DOES carry a real MLS id already
 * upserts correctly (the doc id IS the MLS id, per `IdxListingDoc`'s own
 * comment). The gap was everything else: a manual upload with no parseable
 * listing number fell back to a fresh, request-scoped id every time, so
 * retrying a failed upload — or re-syncing the same public page — minted a
 * brand-new duplicate record instead of updating the one already there.
 *
 * `stableListingId()` closes that gap: the same address always produces the
 * same id, so `.set(..., {merge:true})` naturally upserts on every retry or
 * re-sync. It is deliberately NOT a full USPS normalizer — it expands the
 * common street-suffix and directional abbreviations so "St" / "Street" and
 * "W" / "West" collapse to one key, which is enough to keep one property
 * from splitting into two records when two sources format it slightly
 * differently. It is not enough to catch every real-world address variant,
 * and it is not meant to — the ceiling here is "no duplicate from a retry or
 * a re-sync," not "recognize any two strings that describe the same lot."
 */

const STREET_SUFFIXES: Record<string, string> = {
  st: "street",
  ave: "avenue",
  rd: "road",
  dr: "drive",
  ln: "lane",
  ct: "court",
  blvd: "boulevard",
  pl: "place",
  ter: "terrace",
  cir: "circle",
  hwy: "highway",
  pkwy: "parkway",
};

const DIRECTIONS: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
};

function expandWords(input: string, map: Record<string, string>): string {
  return input
    .split(" ")
    .map((word) => map[word] ?? word)
    .join(" ");
}

/** Lowercase, strip punctuation, collapse whitespace, expand common abbreviations. */
function normalizePart(value: string): string {
  const bare = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return expandWords(expandWords(bare, STREET_SUFFIXES), DIRECTIONS);
}

/** The key two records of the same property should share, regardless of source. */
export function normalizeAddressKey(
  address: string,
  city: string,
  state: string,
): string {
  return [normalizePart(address), normalizePart(city), normalizePart(state)].join(
    "|",
  );
}

/** A deterministic doc id for an address key — same address, same id, every time. */
export function stableListingId(addressKey: string): string {
  return `prop-${createHash("sha1").update(addressKey).digest("hex").slice(0, 16)}`;
}
