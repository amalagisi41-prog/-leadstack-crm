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
  const copy = `${title} — ${strongestFeature}. Offered at $${listing.price.toLocaleString()}.`;
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
    channels: channels.map((channel) => draftFor(channel, copy)),
  };
}
