import type { IdxListingDoc } from "@/types/idx";
import {
  assessBoostEligibility,
  findDistressLanguage,
  strongestVerifiableFeature,
} from "./listing-boost";
import { getTool } from "./tool-registry";
import type {
  CampaignChannel,
  ChannelDraft,
  ContentBrief,
  LseoStrategy,
} from "@/types/marketing-campaigns";

const CHANNEL_TOOL: Record<CampaignChannel, string> = {
  landingPage: "listing.campaign.landingPage",
  facebook: "listing.campaign.facebook",
  instagram: "listing.campaign.instagram",
  email: "listing.campaign.email",
  sms: "listing.campaign.sms",
  googleBusiness: "listing.campaign.googleBusiness",
};

function displayAddress(listing: IdxListingDoc): string {
  let address = listing.address.trim();
  const suffixes = [
    `${listing.city}, ${listing.state} ${listing.zip}`,
    `${listing.city}, ${listing.state}`,
    `${listing.city} ${listing.state} ${listing.zip}`,
  ].filter(Boolean);
  for (const suffix of suffixes) {
    const marker = `, ${suffix}`;
    if (address.toLowerCase().endsWith(marker.toLowerCase()))
      return address.slice(0, -marker.length).trim();
  }
  return address;
}

export function channelCopyFor(
  channel: CampaignChannel,
  listing: IdxListingDoc,
  strongestFeature: string
): string {
  const location = `${listing.city}, ${listing.state}`;
  const address = displayAddress(listing);
  const facts = `${listing.beds} bedrooms, ${listing.baths} bathrooms, ${strongestFeature}, and $${listing.price.toLocaleString()}`;
  switch (channel) {
    case "landingPage":
      return `${address}, ${location}\n\nDiscover this ${listing.propertyType} in ${location}, offered at $${listing.price.toLocaleString()}. The home includes ${facts}. Explore the listing details and request more information.`;
    case "facebook":
      return `A ${strongestFeature} home in ${location}. ${address} is offered at $${listing.price.toLocaleString()} with ${listing.beds} beds and ${listing.baths} baths. #${listing.city.replace(/[^a-z0-9]/gi, "")}RealEstate #ForSale`;
    case "instagram":
      return `${strongestFeature} in ${location} ✨ ${address} · $${listing.price.toLocaleString()} · ${listing.beds} bd · ${listing.baths} ba. #${listing.city.replace(/[^a-z0-9]/gi, "")}Homes #RealEstate`;
    case "email":
      return `Subject: ${address} in ${location}\n\nHi — here are the verified details for ${address}: ${facts}. Reply if you would like to connect about the property.`;
    case "sms":
      return `${address}, ${location}: ${listing.beds} bd, ${listing.baths} ba, ${strongestFeature}, $${listing.price.toLocaleString()}. Reply STOP to opt out.`;
    case "googleBusiness":
      return `${listing.city} real estate listing: ${address}, ${listing.state}. ${listing.propertyType} with ${listing.beds} bedrooms, ${listing.baths} bathrooms, and ${strongestFeature}. Listed at $${listing.price.toLocaleString()}.`;
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

function buildLseoStrategy(
  listing: IdxListingDoc,
  strongestFeature: string,
  dataGaps: string[]
): LseoStrategy {
  const location = `${listing.city}, ${listing.state}`;
  const address = displayAddress(listing);
  const searchTitle =
    `${address} | ${listing.city}, ${listing.state} home for sale`.slice(0, 60);
  const metaDescription =
    `${listing.propertyType} at ${address} in ${location}: ${listing.beds} beds, ${listing.baths} baths, and ${strongestFeature}. View verified details.`.slice(
      0,
      155
    );
  const blockers: string[] = [];
  if (!listing.disclaimer)
    blockers.push("Add the exact MLS/IDX disclaimer before publishing.");
  if (listing.photos.length === 0)
    blockers.push(
      "Add at least one authorized property photo before publishing the landing page."
    );
  const score = Math.max(0, 100 - blockers.length * 20 - dataGaps.length * 5);
  return {
    score,
    searchTitle,
    metaDescription,
    primaryQuery: `${listing.city} ${listing.state} ${listing.propertyType} for sale`,
    localSignals: [
      `Consistent address: ${address}, ${location} ${listing.zip}`,
    ],
    recommendations: [
      "Use one clear property intent per landing page and keep the address consistent across channels.",
      "Link the landing page from the agent site and relevant local content; avoid duplicate near-identical pages.",
      "Keep price, status, photos, attribution, and disclaimer synchronized with the authorized source.",
      ...(dataGaps.length
        ? [`Fill verified data gaps where available: ${dataGaps.join(", ")}.`]
        : []),
    ],
    blockers,
  };
}

export function buildContentBrief(
  listing: IdxListingDoc,
  now = new Date()
): ContentBrief {
  const eligibility = assessBoostEligibility(listing, now);
  const strongestFeature = strongestVerifiableFeature(listing);
  const address = displayAddress(listing);
  const title = `${address}, ${listing.city}, ${listing.state}`;
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
    address,
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
    channels: channels.map((channel) =>
      draftFor(channel, channelCopyFor(channel, listing, strongestFeature))
    ),
    lseo: buildLseoStrategy(listing, strongestFeature, dataGaps),
  };
}
