import { FieldValue } from "firebase-admin/firestore";
import type { SubAccountDoc } from "@/types";
import type { IdxListingDoc } from "@/types/idx";
import type {
  CampaignChannel,
  ContentBrief,
} from "@/types/marketing-campaigns";

export function isIdxCampaignEnabled(
  sub: Pick<SubAccountDoc, "idxEnabledByAgency" | "idxConfig">
): boolean {
  return sub.idxEnabledByAgency === true && sub.idxConfig?.enabled === true;
}

export function buildManualListing(
  body: Record<string, unknown>,
  subAccountId: string,
  listingId = typeof body.listingId === "string" && body.listingId.trim()
    ? body.listingId.trim()
    : `manual-${Date.now()}`
): IdxListingDoc | string {
  const text = (key: string) =>
    typeof body[key] === "string" ? String(body[key]).trim() : "";
  const number = (key: string) =>
    typeof body[key] === "number" && Number.isFinite(body[key])
      ? Number(body[key])
      : 0;
  const photos = Array.isArray(body.photos)
    ? body.photos.filter(
        (p): p is string => typeof p === "string" && /^https:\/\//i.test(p)
      )
    : [];
  if (!text("address") || !text("city") || !text("state"))
    return "MLS number or address, city, and state are required.";
  return {
    id: listingId,
    subAccountId,
    mlsId: "manual",
    status: "active",
    price: number("price"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    beds: number("beds"),
    baths: number("baths"),
    sqft: number("sqft") || null,
    yearBuilt: number("yearBuilt") || null,
    propertyType: text("propertyType") || "home",
    photos,
    remarks: text("remarks"),
    listingAgentName: null,
    listingOfficeName: null,
    disclaimer: text("disclaimer") || null,
    lat: null,
    lng: null,
    raw: {},
    syncedAt: FieldValue.serverTimestamp(),
  };
}

export function blockedCampaignChannels(
  brief: ContentBrief,
  wanted: CampaignChannel[]
) {
  return brief.channels
    .filter((channel) => wanted.includes(channel.channel))
    .filter(
      (channel) => channel.status !== "ready" || channel.findings.length > 0
    );
}

/** Match only identifiers preserved from the official IDX response. */
export function listingMatchesIdentifier(
  listing: IdxListingDoc,
  identifier: string
): boolean {
  const wanted = identifier.trim().toLowerCase();
  if (!wanted) return false;
  if (listing.id.toLowerCase() === wanted) return true;
  const raw = listing.raw;
  return [
    raw.listingID,
    raw.mlsNumber,
    raw.mlsID,
    raw.mlsId,
    raw.mlsListingID,
    raw.mlsListingId,
  ].some(
    (value) =>
      (typeof value === "string" || typeof value === "number") &&
      String(value).trim().toLowerCase() === wanted
  );
}

function normalizeListingSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Match a user-entered address against normalized fields in the IDX cache. */
export function listingMatchesAddress(
  listing: IdxListingDoc,
  addressQuery: string
): boolean {
  const wanted = normalizeListingSearchText(addressQuery);
  if (!wanted) return false;
  const address = normalizeListingSearchText(listing.address);
  const fullAddress = normalizeListingSearchText(
    [listing.address, listing.city, listing.state, listing.zip].join(" ")
  );
  return address === wanted || fullAddress.includes(wanted);
}
