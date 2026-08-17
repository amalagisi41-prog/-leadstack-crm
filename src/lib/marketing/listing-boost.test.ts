import { describe, expect, it } from "vitest";
import { checkFairHousing } from "@/lib/workflows/guardrails";
import {
  BOOST_TIERS,
  CHANNEL_SPECS,
  assessBoostEligibility,
  boostTierFor,
  channelSpec,
  findDistressLanguage,
  resolveDaysOnMarket,
  supportedChannels,
} from "./listing-boost";
import {
  ZACK_TOOL_REGISTRY,
  gateTool,
  getTool,
  requiresHumanApproval,
} from "./tool-registry";
import type { CapabilityId } from "@/lib/website-studio/prompt-library/capabilities";

const NOW = new Date("2026-08-17T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const listing = (over: Record<string, unknown> = {}) => ({
  status: "active" as const,
  photos: ["https://example.test/1.jpg"],
  raw: {} as Record<string, unknown>,
  ...over,
});

describe("working out how long it has been listed", () => {
  it("reads a list date from the vendor payload", () => {
    expect(
      resolveDaysOnMarket({ raw: { listDate: daysAgo(45) } }, NOW)
    ).toBe(45);
  });

  it("accepts a day count the feed supplies directly", () => {
    expect(resolveDaysOnMarket({ raw: { daysOnMarket: 62 } }, NOW)).toBe(62);
    expect(resolveDaysOnMarket({ raw: { dom: "31" } }, NOW)).toBe(31);
  });

  it("returns null when the feed does not say", () => {
    // IdxListingDoc does not normalise a list date, and not every MLS supplies
    // one. Null has to mean "cannot tell", never "brand new" — guessing a tier
    // from an unknown age attaches a price-reduction angle to a listing that
    // went live last week.
    expect(resolveDaysOnMarket({ raw: {} }, NOW)).toBeNull();
    expect(resolveDaysOnMarket({ raw: { listDate: "" } }, NOW)).toBeNull();
    expect(resolveDaysOnMarket({ raw: { listDate: "whenever" } }, NOW)).toBeNull();
  });

  it("treats a future list date as bad data, not a negative age", () => {
    expect(
      resolveDaysOnMarket({ raw: { listDate: daysAgo(-10) } }, NOW)
    ).toBeNull();
  });
});

describe("which tier a listing has reached", () => {
  it("has nothing to say before 30 days", () => {
    for (const dom of [0, 1, 29]) {
      expect(boostTierFor(dom), `${dom} days`).toBeNull();
    }
  });

  it("steps up at 30, 60 and 90", () => {
    expect(boostTierFor(30)?.tier).toBe("day30");
    expect(boostTierFor(59)?.tier).toBe("day30");
    expect(boostTierFor(60)?.tier).toBe("day60");
    expect(boostTierFor(89)?.tier).toBe("day60");
    expect(boostTierFor(90)?.tier).toBe("day90");
    expect(boostTierFor(400)?.tier).toBe("day90");
  });

  it("never tells the audience how long it has been sitting", () => {
    // Time on market is the seller's business. Announcing it in the creative
    // invites exactly the lowball the re-promotion is meant to avoid.
    for (const tier of BOOST_TIERS) {
      expect(tier.guidance, tier.tier).toMatch(
        /no reference to time on market|do not mention how long|never explain or apologise for the time on market/i
      );
    }
  });

  it("only escalates the offer at 90 days, never the desperation", () => {
    const ninety = BOOST_TIERS.find((t) => t.tier === "day90")!;
    expect(ninety.guidance).toMatch(/real change|price improvement/i);
    expect(ninety.guidance).toMatch(/never imply the seller is under pressure/i);
  });
});

describe("whether a listing should be promoted at all", () => {
  it("promotes an active listing past 30 days", () => {
    const result = assessBoostEligibility(
      listing({ raw: { listDate: daysAgo(35) } }),
      NOW
    );
    expect(result.eligible).toBe(true);
    expect(result.tier?.tier).toBe("day30");
  });

  it("refuses anything that is not active", () => {
    // Enquiries the agent cannot serve, and for a sold home, a complaint from
    // the person now living in it.
    for (const status of ["pending", "sold", "off-market"] as const) {
      const result = assessBoostEligibility(
        listing({ status, raw: { listDate: daysAgo(120) } }),
        NOW
      );
      expect(result.eligible, status).toBe(false);
      expect(result.reason, status).toMatch(new RegExp(status));
    }
  });

  it("says plainly when the feed has no list date", () => {
    const result = assessBoostEligibility(listing(), NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/not sending a list date/i);
    // Still gives them somewhere to go — a refusal with no next step is a
    // dead end.
    expect(result.reason).toMatch(/manually/i);
  });

  it("holds off on a listing that is still new", () => {
    const result = assessBoostEligibility(
      listing({ raw: { listDate: daysAgo(9) } }),
      NOW
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/9 days/);
    expect(result.reason).toMatch(/starts at 30 days/i);
  });

  it("refuses a listing with no photography", () => {
    const result = assessBoostEligibility(
      listing({ photos: [], raw: { listDate: daysAgo(70) } }),
      NOW
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/no photos/i);
  });

  it("always explains itself when it says no", () => {
    for (const l of [
      listing({ status: "sold" }),
      listing(),
      listing({ raw: { listDate: daysAgo(3) } }),
      listing({ photos: [], raw: { listDate: daysAgo(99) } }),
    ]) {
      const result = assessBoostEligibility(l, NOW);
      expect(result.eligible).toBe(false);
      expect(result.reason.trim().length).toBeGreaterThan(30);
    }
  });
});

describe("copy that would weaken the seller's position", () => {
  it("catches the language a stale listing invites", () => {
    for (const copy of [
      "Motivated seller — bring all offers!",
      "This one is priced to move",
      "Seller is flexible on terms",
      "Back on the market and won't last",
      "Final price drop, act fast",
    ]) {
      expect(findDistressLanguage(copy).length, copy).toBeGreaterThan(0);
    }
  });

  it("leaves ordinary listing copy alone", () => {
    for (const copy of [
      "Three bedrooms, a south-facing garden, and a new roof fitted in 2024.",
      "Open house Saturday from 1pm.",
      "The price was improved to $625,000 this week.",
      "Walking distance to the station.",
    ]) {
      expect(findDistressLanguage(copy), copy).toEqual([]);
    }
  });

  it("is a code control, not prompt advice", () => {
    // The failure mode is copy that reads well, converts, and quietly costs
    // the client money at the negotiating table — nobody catches it by eye.
    const findings = findDistressLanguage("MOTIVATED SELLER, must sell fast");
    expect(findings.map((f) => f.phrase)).toContain("motivated seller");
    expect(findings.map((f) => f.phrase)).toContain("must sell");
  });
});

describe("channel specs", () => {
  it("publishes only where AgentStack actually can", () => {
    // SocialPlatform is Meta-only. LinkedIn is declared so the gap is visible
    // in the picker rather than promised in a plan and then silently missing.
    expect(supportedChannels().map((c) => c.id).sort()).toEqual([
      "facebook",
      "instagram",
    ]);
    expect(channelSpec("linkedin")?.supported).toBe(false);
  });

  it("gives every channel a usable ratio, caption limit and hook rule", () => {
    for (const spec of CHANNEL_SPECS) {
      expect(spec.aspectRatios.length, spec.id).toBeGreaterThan(0);
      expect(spec.captionChars, spec.id).toBeGreaterThan(100);
      expect(spec.hookGuidance.length, spec.id).toBeGreaterThan(40);
      const [lo, hi] = spec.hashtagRange;
      expect(lo, spec.id).toBeLessThanOrEqual(hi);
    }
  });

  it("does not hand every channel the same rules", () => {
    // A caption written once and posted everywhere is what makes an agent's
    // feed look automated.
    const ig = channelSpec("instagram")!;
    const fb = channelSpec("facebook")!;
    expect(ig.hookGuidance).not.toBe(fb.hookGuidance);
    expect(ig.hashtagRange).not.toEqual(fb.hashtagRange);
  });

  it("keeps its own guidance Fair Housing clean", () => {
    for (const spec of CHANNEL_SPECS) {
      expect(checkFairHousing(spec.hookGuidance).matchedPhrases, spec.id).toEqual([]);
    }
    for (const tier of BOOST_TIERS) {
      expect(checkFairHousing(tier.guidance).matchedPhrases, tier.tier).toEqual([]);
    }
  });
});

describe("the tool registry", () => {
  const ALL_AVAILABLE: Record<CapabilityId, boolean> = {
    businessProfile: true,
    idx: true,
    reviews: true,
    webChat: true,
    aiAgent: true,
  };

  it("makes every tool declare approval, reversibility and screens", () => {
    for (const tool of ZACK_TOOL_REGISTRY) {
      expect(tool.approval, tool.id).toBeTruthy();
      expect(tool.reversibility, tool.id).toBeTruthy();
      expect(tool.screens.length, tool.id).toBeGreaterThan(0);
      expect(tool.audited, tool.id).toBe(true);
      expect(tool.summary.trim().length, tool.id).toBeGreaterThan(20);
    }
  });

  it("requires a human for anything that leaves the workspace", () => {
    // The line that must never move: no autonomous outbound.
    for (const tool of ZACK_TOOL_REGISTRY) {
      if (!tool.outbound) continue;
      expect(requiresHumanApproval(tool), tool.id).toBe(true);
      expect(tool.approval, tool.id).toBe("operator-explicit");
    }
  });

  it("screens anything outbound against the send guardrails", () => {
    const activate = getTool("campaign.followup.activate")!;
    expect(activate.screens).toContain("send-guardrails");
    expect(activate.reversibility).toBe("permanent");
  });

  it("screens every listing tool for the seller's position", () => {
    for (const tool of ZACK_TOOL_REGISTRY) {
      if (!tool.id.startsWith("listing.")) continue;
      expect(tool.screens, tool.id).toContain("seller-position");
      expect(tool.screens, tool.id).toContain("mls-attribution");
    }
  });

  it("lets a drafting tool run without ceremony", () => {
    const gate = gateTool("listing.boost.plan", ALL_AVAILABLE);
    expect(gate.allowed).toBe(true);
    expect(gate.needsApproval).toBe(false);
  });

  it("blocks a tool whose capabilities are missing, and names them", () => {
    const gate = gateTool("listing.boost.plan", {
      ...ALL_AVAILABLE,
      idx: false,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.missing).toEqual(["idx"]);
    expect(gate.reason).toMatch(/idx/);
  });

  it("fails closed on a tool it has never heard of", () => {
    // A tool absent from the registry has been through no approval or
    // compliance decision. Running it because the model asked for it is the
    // entire failure this registry exists to prevent.
    const gate = gateTool("listing.delete.everything", ALL_AVAILABLE);
    expect(gate.allowed).toBe(false);
    expect(gate.needsApproval).toBe(true);
    expect(gate.reason).toMatch(/not a capability/i);
  });
});
