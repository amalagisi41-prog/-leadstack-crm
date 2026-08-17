import type { IdxListingDoc } from "@/types/idx";
import type { SocialPlatform } from "@/types/social";

/**
 * Re-promoting a listing that has not sold, at 30 / 60 / 90 days.
 *
 * The marketing part is easy. The part that needs care is that days-on-market
 * is a fact about someone else's asset, and how it gets talked about has
 * consequences for the seller the agent represents.
 *
 * A stale listing tempts exactly the wrong copy: "motivated seller", "must
 * sell", "bring all offers", "priced to move". Every one of those tells a
 * buyer's agent the seller is under pressure, which weakens the negotiating
 * position of the client the listing agent owes a fiduciary duty to. It is not
 * a style preference — it is the agent working against their own principal, in
 * writing, published. So distress language is blocked in code, not discouraged
 * in a prompt.
 *
 * The tiers escalate what is *offered*, never how desperate it sounds.
 */

export type BoostTier = "day30" | "day60" | "day90";

export interface BoostTierPlan {
  tier: BoostTier;
  minDays: number;
  label: string;
  /** What actually changes at this tier. */
  angle: string;
  /** The brief handed to copy generation. */
  guidance: string;
}

export const BOOST_TIERS: readonly BoostTierPlan[] = [
  {
    tier: "day30",
    minDays: 30,
    label: "30 days — new audience",
    angle: "Same listing, people who have not seen it yet.",
    guidance:
      "Re-introduce the property to a fresh audience. Lead with the single strongest feature that is verifiable from the listing record. Do not mention how long it has been listed, and do not suggest anything is wrong with it — at 30 days nothing is.",
  },
  {
    tier: "day60",
    minDays: 60,
    label: "60 days — new angle",
    angle: "Reframe around a different buyer's reason to care.",
    guidance:
      "The first angle did not land, so lead with a different genuine strength — layout, land, location, condition, or a recent improvement. Highlight a feature the earlier posts did not. Still no reference to time on market.",
  },
  {
    tier: "day90",
    minDays: 90,
    label: "90 days — what changed",
    angle: "Only run this when something factual has actually changed.",
    guidance:
      "At this point new creative on unchanged facts is noise. Anchor the post on a real change: a price improvement, a completed repair, new photography, or a new incentive the seller has approved. State the change plainly and neutrally. Never explain or apologise for the time on market, and never imply the seller is under pressure.",
  },
];

/**
 * Phrases that reveal the seller's position, and safer replacements.
 *
 * Blocked outright rather than rewritten by the model: this is the failure
 * mode where the copy reads well, converts, and quietly costs the client
 * money at the negotiating table.
 */
export const DISTRESS_PHRASES: readonly string[] = [
  "motivated seller",
  "must sell",
  "desperate",
  "bring all offers",
  "bring any offer",
  "priced to move",
  "priced to sell fast",
  "seller is flexible",
  "make an offer",
  "any reasonable offer",
  "needs to sell",
  "will consider all offers",
  "reduced again",
  "back on the market",
  "no longer on the market for long",
  "won't last",
  "act fast",
  "final price drop",
];

export interface DistressFinding {
  phrase: string;
}

/** Screen listing copy for language that weakens the seller's position. */
export function findDistressLanguage(copy: string): DistressFinding[] {
  const lower = (copy || "").toLowerCase();
  return DISTRESS_PHRASES.filter((phrase) => lower.includes(phrase)).map(
    (phrase) => ({ phrase })
  );
}

/**
 * Days on market, or null when it cannot be established.
 *
 * `IdxListingDoc` does not normalise a list date — the field lives only in the
 * vendor payload under `raw`, and not every MLS feed supplies it. Null is
 * therefore a real and common answer, and the caller must treat it as "cannot
 * tell" rather than "zero". Guessing a tier from an unknown age would attach a
 * price-reduction angle to a listing that went live last week.
 */
export function resolveDaysOnMarket(
  listing: Pick<IdxListingDoc, "raw">,
  now: Date = new Date()
): number | null {
  const raw = listing.raw ?? {};
  const candidates = [
    raw.listDate,
    raw.listingDate,
    raw.onMarketDate,
    raw.dateListed,
    raw.daysOnMarket,
    raw.dom,
  ];

  for (const value of candidates) {
    // A feed may hand back the count directly.
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 0 && !value.includes("-")) {
        return Math.floor(numeric);
      }
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        const days = Math.floor((now.getTime() - parsed) / 86_400_000);
        // A future list date is bad data, not a negative age.
        if (days >= 0) return days;
      }
    }
  }
  return null;
}

/** The highest tier this listing has reached, or null if it is too new. */
export function boostTierFor(daysOnMarket: number | null): BoostTierPlan | null {
  if (daysOnMarket === null) return null;
  let match: BoostTierPlan | null = null;
  for (const tier of BOOST_TIERS) {
    if (daysOnMarket >= tier.minDays) match = tier;
  }
  return match;
}

export interface BoostEligibility {
  eligible: boolean;
  tier: BoostTierPlan | null;
  daysOnMarket: number | null;
  /** Why not, in the agent's language. Empty when eligible. */
  reason: string;
}

/**
 * Whether this listing should be boosted at all.
 *
 * Only an active listing qualifies. Promoting a pending or sold property
 * generates enquiries the agent cannot serve and, for a sold one, invites a
 * complaint from the buyer who now lives there.
 */
export function assessBoostEligibility(
  listing: Pick<IdxListingDoc, "status" | "raw" | "photos">,
  now: Date = new Date()
): BoostEligibility {
  const daysOnMarket = resolveDaysOnMarket(listing, now);

  if (listing.status !== "active") {
    return {
      eligible: false,
      tier: null,
      daysOnMarket,
      reason: `This listing is ${listing.status}. Promoting it would bring in enquiries you cannot act on.`,
    };
  }

  if (daysOnMarket === null) {
    return {
      eligible: false,
      tier: null,
      daysOnMarket: null,
      reason:
        "Your MLS feed is not sending a list date for this property, so there is no way to tell how long it has been on the market. Set the campaign up manually and choose the angle yourself.",
    };
  }

  const tier = boostTierFor(daysOnMarket);
  if (!tier) {
    return {
      eligible: false,
      tier: null,
      daysOnMarket,
      reason: `This has been listed ${daysOnMarket} ${daysOnMarket === 1 ? "day" : "days"}. Re-promotion starts at 30 days — before that the original marketing has not finished working.`,
    };
  }

  if (listing.photos.length === 0) {
    return {
      eligible: false,
      tier,
      daysOnMarket,
      reason:
        "This listing has no photos in the feed. A property post without an image gets almost no reach on any channel — add photography first.",
    };
  }

  return { eligible: true, tier, daysOnMarket, reason: "" };
}

/**
 * Creative constraints per channel.
 *
 * These are the platform-imposed limits that decide whether a post renders
 * properly, not opinions about what performs. `supported` is separate on
 * purpose: LinkedIn belongs in any serious agent's channel mix, but
 * `SocialPlatform` publishes to Meta only, so it is declared and visibly
 * unavailable rather than quietly promised and then missing.
 */
export interface ChannelSpec {
  id: SocialPlatform | "linkedin";
  label: string;
  supported: boolean;
  /** Image aspect ratios that render without cropping. */
  aspectRatios: readonly string[];
  /** Practical caption ceiling before truncation hurts. */
  captionChars: number;
  /** Hashtags that help rather than look spammy. */
  hashtagRange: readonly [number, number];
  /** How the opening line has to behave on this surface. */
  hookGuidance: string;
}

export const CHANNEL_SPECS: readonly ChannelSpec[] = [
  {
    id: "instagram",
    label: "Instagram",
    supported: true,
    aspectRatios: ["4:5", "1:1"],
    captionChars: 220,
    hashtagRange: [3, 8],
    hookGuidance:
      "The image carries the post. The first line is read after the photo, and only about 125 characters show before 'more' — put the single most striking fact there.",
  },
  {
    id: "facebook",
    label: "Facebook",
    supported: true,
    aspectRatios: ["1.91:1", "1:1"],
    captionChars: 400,
    hashtagRange: [0, 3],
    hookGuidance:
      "Written like a person talking, not an ad. Roughly the first 80 characters show before 'See more'. Hashtags add little here.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    supported: false,
    aspectRatios: ["1.91:1", "1:1"],
    captionChars: 600,
    hashtagRange: [3, 5],
    hookGuidance:
      "A professional audience: lead with the market observation the listing illustrates, not the listing itself.",
  },
];

export function channelSpec(id: string): ChannelSpec | null {
  return CHANNEL_SPECS.find((c) => c.id === id) ?? null;
}

export function supportedChannels(): ChannelSpec[] {
  return CHANNEL_SPECS.filter((c) => c.supported);
}
