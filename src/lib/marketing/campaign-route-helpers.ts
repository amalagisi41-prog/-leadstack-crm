import { FieldValue } from "firebase-admin/firestore";
import type { SubAccountDoc } from "@/types";
import type { IdxListingDoc } from "@/types/idx";
import type { CampaignChannel, ContentBrief } from "@/types/marketing-campaigns";

export function isIdxCampaignEnabled(sub: Pick<SubAccountDoc, "idxEnabledByAgency" | "idxConfig">): boolean {
  return sub.idxEnabledByAgency === true && sub.idxConfig?.enabled === true;
}

export function buildManualListing(body: Record<string, unknown>, subAccountId: string, listingId = `manual-${Date.now()}`): IdxListingDoc | string {
  const text = (key: string) => typeof body[key] === "string" ? String(body[key]).trim() : "";
  const number = (key: string) => typeof body[key] === "number" && Number.isFinite(body[key]) ? Number(body[key]) : 0;
  const photos = Array.isArray(body.photos) ? body.photos.filter((p): p is string => typeof p === "string" && /^https:\/\//i.test(p)) : [];
  if (!text("address") || !text("city") || !text("state")) return "MLS number or address, city, and state are required.";
  return { id: listingId, subAccountId, mlsId: "manual", status: "active", price: number("price"), address: text("address"), city: text("city"), state: text("state"), zip: text("zip"), beds: number("beds"), baths: number("baths"), sqft: number("sqft") || null, yearBuilt: number("yearBuilt") || null, propertyType: text("propertyType") || "home", photos, remarks: text("remarks"), listingAgentName: null, listingOfficeName: null, disclaimer: text("disclaimer") || null, lat: null, lng: null, raw: {}, syncedAt: FieldValue.serverTimestamp() };
}

export function blockedCampaignChannels(brief: ContentBrief, wanted: CampaignChannel[]) {
  return brief.channels.filter((channel) => wanted.includes(channel.channel)).filter((channel) => channel.status !== "ready" || channel.findings.length > 0);
}
