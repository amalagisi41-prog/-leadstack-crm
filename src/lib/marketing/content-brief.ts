import type { IdxListingDoc } from "@/types/idx";
import {
  assessBoostEligibility,
  findDistressLanguage,
  strongestVerifiableFeature,
} from "./listing-boost";
import { getTool } from "./tool-registry";
import type { CampaignChannel, ChannelDraft, ContentBrief } from "@/types/marketing-campaigns";

const CHANNEL_TOOL: Record<CampaignChannel, string> = {
  landingPage: "listing.campaign.landingPage",
  facebook: "listing.campaign.facebook",
  instagram: "listing.campaign.instagram",
  email: "listing.campaign.email",
  sms: "listing.campaign.sms",
  googleBusiness: "listing.campaign.googleBusiness",
};

export function channelCopyFor(channel: CampaignChannel, listing: IdxListingDoc, strongestFeature: string): string {
  const location = `${listing.city}, ${listing.state}`;
  const facts = `${listing.beds} bedrooms, ${listing.baths} bathrooms, ${strongestFeature}, and $${listing.price.toLocaleString()}`;
  switch (channel) {
    case "landingPage":
      return `${listing.address}, ${location}\n\nDiscover this ${listing.propertyType} in ${location}, offered at $${listing.price.toLocaleString()}. The home includes ${facts}. Explore the listing details and request more information.`;
    case "facebook":
      return `A ${strongestFeature} home in ${location}. ${listing.address} is offered at $${listing.price.toLocaleString()} with ${listing.beds} beds and ${listing.baths} baths. #${listing.city.replace(/[^a-z0-9]/gi, "")}RealEstate #ForSale`;
    case "instagram":
      return `${strongestFeature} in ${location} ✨ ${listing.address} · $${listing.price.toLocaleString()} · ${listing.beds} bd · ${listing.baths} ba. #${listing.city.replace(/[^a-z0-9]/gi, "")}Homes #RealEstate`;
    case "email":
      return `Subject: ${listing.address} in ${location}\n\nHi — here are the verified details for ${listing.address}: ${facts}. Reply if you would like to connect about the property.`;
    case "sms":
      return `${listing.address}, ${location}: ${listing.beds} bd, ${listing.baths} ba, ${strongestFeature}, $${listing.price.toLocaleString()}. Reply STOP to opt out.`;
    case "googleBusiness":
      return `${listing.city} real estate listing: ${listing.address}, ${listing.state}. ${listing.propertyType} with ${listing.beds} bedrooms, ${listing.baths} bathrooms, and ${strongestFeature}. Listed at $${listing.price.toLocaleString()}.`;
  }
}

function draftFor(channel: CampaignChannel, copy: string): ChannelDraft {
  const tool = getTool(CHANNEL_TOOL[channel]);
  const findings = findDistressLanguage(copy).map((f) => f.phrase);
  return {
    channel,
    body: copy,
    status: findings.length ? "needs-review" : "ready",
    approval: tool?.approval ?? "operator",
    reversibility: tool?.reversibility ?? "recallable",
    screens: [...(tool?.screens ?? ["no-invented-facts"])],
    findings,
  };
}

export function buildContentBrief(listing: IdxListingDoc, now = new Date()): ContentBrief {
  const eligibility = assessBoostEligibility(listing, now);
  const strongestFeature = strongestVerifiableFeature(listing);
  const title = `${listing.address}, ${listing.city}, ${listing.state}`;
  const description = `${listing.beds} bedroom, ${listing.baths} bathroom ${listing.propertyType} featuring ${strongestFeature}.`;
  const channels: CampaignChannel[] = [
    "landingPage",
    "facebook",
    "instagram",
    "email",
    "sms",
    "googleBusiness",
  ];
  const dataGaps: string[] = [];
  if (listing.raw.schoolZone == null) dataGaps.push("school zone");
  if (listing.raw.walkScore == null) dataGaps.push("walk score");
  if (listing.raw.lotSize == null) dataGaps.push("lot size");
  return {
    listingId: listing.id,
    mlsId: listing.mlsId,
    title,
    description,
    strongestFeature,
    price: listing.price,
    address: listing.address,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    yearBuilt: listing.yearBuilt,
    propertyType: listing.propertyType,
    images: listing.photos,
    disclaimer: listing.disclaimer,
    boostTier: eligibility.tier?.tier ?? null,
    daysOnMarket: eligibility.daysOnMarket,
    dataGaps,
    channels: channels.map((channel) => draftFor(channel, channelCopyFor(channel, listing, strongestFeature))),
  };
}
