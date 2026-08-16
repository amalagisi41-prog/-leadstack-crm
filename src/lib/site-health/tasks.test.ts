import { describe, expect, it } from "vitest";
import {
  computeSiteHealth,
  remainingSiteHealthTaskIds,
  type SiteHealthInputs,
} from "./tasks";

/**
 * The path to 100%, walked persona by persona.
 *
 * Site Health is the number an agent is actually chasing, so each situation
 * below is taken from "just signed up" all the way to done. Where a persona
 * cannot reach 100%, the test says so explicitly rather than asserting a
 * comfortable partial number — a ceiling an agent cannot clear is a product
 * gap, and it should fail loudly here the day someone tries to fix it.
 */

/** A brand-new sub-account: nothing configured at all. */
const NOTHING: SiteHealthInputs = {
  profile: {},
  publishedWebsite: false,
  publishedAgentSite: false,
  customDomain: undefined,
  hasLeadForm: false,
  hasBookingPage: false,
  webChatEnabled: false,
  businessEmailVerified: false,
};

/** The blueprint + compliance work every persona has to do. */
const PROFILE_DONE: SiteHealthInputs["profile"] = {
  completeness: 90,
  brokerage: "Example Realty",
  licenseNumber: "RES.0800123",
  fairHousing: true,
  noLegalTaxAdvice: true,
  optOutLanguage: "Reply STOP to opt out.",
};

/** Everything that has nothing to do with the website itself. */
const ENGAGEMENT_DONE = {
  hasLeadForm: true,
  hasBookingPage: true,
  webChatEnabled: true,
  businessEmailVerified: true,
} as const;

describe("Site Health — starting from nothing", () => {
  it("scores 0% with all eight tasks outstanding", () => {
    const result = computeSiteHealth(NOTHING);

    expect(result.score).toBe(0);
    expect(result.total).toBe(8);
    expect(remainingSiteHealthTaskIds(NOTHING)).toEqual([
      "blueprint",
      "compliance",
      "website",
      "domain",
      "lead-capture",
      "booking",
      "chat",
      "email",
    ]);
  });

  it("moves in whole steps of one eighth", () => {
    expect(
      computeSiteHealth({ ...NOTHING, profile: { completeness: 80 } }).score
    ).toBe(13);
    expect(
      computeSiteHealth({ ...NOTHING, profile: PROFILE_DONE }).score
    ).toBe(25);
  });
});

describe("Site Health — persona A: new agent with nothing, builds in AgentStack", () => {
  // Signs up, fills the blueprint, builds and publishes a site in Website
  // Studio, registers a domain, and turns on the engagement tools.
  const complete: SiteHealthInputs = {
    profile: PROFILE_DONE,
    publishedWebsite: false,
    publishedAgentSite: true,
    customDomain: "yournamehomes.com",
    ...ENGAGEMENT_DONE,
  };

  it("reaches 100%", () => {
    const result = computeSiteHealth(complete);
    expect(result.score).toBe(100);
    expect(remainingSiteHealthTaskIds(complete)).toEqual([]);
  });

  it("is blocked only by publishing while the draft is unpublished", () => {
    const draftOnly = { ...complete, publishedAgentSite: false };
    expect(remainingSiteHealthTaskIds(draftOnly)).toEqual(["website"]);
    expect(computeSiteHealth(draftOnly).score).toBe(88);
  });
});

describe("Site Health — persona B: agent bringing an existing website", () => {
  // The Example Realty case: a real site already live on its own host,
  // domain connected, hosting connected, and no intention of rebuilding it in
  // Website Studio.
  const keepsOwnSite: SiteHealthInputs = {
    profile: PROFILE_DONE,
    publishedWebsite: false,
    publishedAgentSite: false,
    customDomain: "example-realty.test",
    ...ENGAGEMENT_DONE,
  };

  it("reaches 100% once their own live site is verified", () => {
    // This persona used to be capped at 88% with nothing left they could do:
    // the publish task accepted only an AgentStack-hosted site, so an agent
    // who kept their existing website could never clear it.
    const verified = { ...keepsOwnSite, externalSiteVerified: true };

    expect(computeSiteHealth(verified).score).toBe(100);
    expect(remainingSiteHealthTaskIds(verified)).toEqual([]);
  });

  it("still holds at 88% while the site is unverified", () => {
    const result = computeSiteHealth(keepsOwnSite);

    // Verification is the whole point — an unchecked claim must not pass.
    expect(result.completed).toBe(7);
    expect(result.score).toBe(88);
    expect(remainingSiteHealthTaskIds(keepsOwnSite)).toEqual(["website"]);
  });

  it("describes the task in a way that admits an existing site", () => {
    const pending = computeSiteHealth(keepsOwnSite).tasks.find(
      (task) => task.id === "website"
    )!;
    expect(pending.detail).toContain("connect the one you already have");

    const done = computeSiteHealth({
      ...keepsOwnSite,
      externalSiteVerified: true,
    }).tasks.find((task) => task.id === "website")!;
    expect(done.detail).toContain("your own domain");
  });

  it("also clears via a site published inside AgentStack", () => {
    expect(
      computeSiteHealth({ ...keepsOwnSite, publishedAgentSite: true }).score
    ).toBe(100);
    // The legacy website collection satisfies it too.
    expect(
      computeSiteHealth({ ...keepsOwnSite, publishedWebsite: true }).score
    ).toBe(100);
  });
});

describe("Site Health — persona C: agent migrating from another CRM", () => {
  // Mid-migration: domain saved, hosting chosen, site not yet rebuilt or
  // republished on AgentStack.
  const midMigration: SiteHealthInputs = {
    profile: PROFILE_DONE,
    publishedWebsite: false,
    publishedAgentSite: false,
    customDomain: "example-realty.test",
    hasLeadForm: true,
    hasBookingPage: false,
    webChatEnabled: false,
    businessEmailVerified: false,
  };

  it("reports the remaining work in the order it is shown", () => {
    expect(remainingSiteHealthTaskIds(midMigration)).toEqual([
      "website",
      "booking",
      "chat",
      "email",
    ]);
    expect(computeSiteHealth(midMigration).score).toBe(50);
  });

  it("finishes at 100% once the site is published and the tools are on", () => {
    expect(
      computeSiteHealth({
        ...midMigration,
        publishedAgentSite: true,
        ...ENGAGEMENT_DONE,
      }).score
    ).toBe(100);
  });
});

describe("Site Health — the domain task", () => {
  it("counts any saved custom domain, regardless of where DNS points", () => {
    // Deliberate: the task is satisfied by saving the domain, so an agent is
    // never held at 88% waiting on a DNS propagation this app cannot observe.
    const withDomain = { ...NOTHING, customDomain: "example-realty.test" };
    expect(remainingSiteHealthTaskIds(withDomain)).not.toContain("domain");
  });

  it("treats an empty string as not connected", () => {
    expect(
      remainingSiteHealthTaskIds({ ...NOTHING, customDomain: "" })
    ).toContain("domain");
  });
});

describe("Site Health — compliance is all-or-nothing", () => {
  it("stays incomplete until every compliance field is present", () => {
    const partial: SiteHealthInputs = {
      ...NOTHING,
      profile: { ...PROFILE_DONE, optOutLanguage: undefined },
    };
    expect(remainingSiteHealthTaskIds(partial)).toContain("compliance");
  });

  it("requires the acknowledgements to be true, not merely set", () => {
    const unchecked: SiteHealthInputs = {
      ...NOTHING,
      profile: { ...PROFILE_DONE, fairHousing: false },
    };
    expect(remainingSiteHealthTaskIds(unchecked)).toContain("compliance");
  });
});
