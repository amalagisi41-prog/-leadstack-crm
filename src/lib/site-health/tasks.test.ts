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
  brokerage: "Artisan Home Network",
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
  // The Artisan Home Network case: a real site already live on its own host,
  // domain connected, hosting connected, and no intention of rebuilding it in
  // Website Studio.
  const keepsOwnSite: SiteHealthInputs = {
    profile: PROFILE_DONE,
    publishedWebsite: false,
    publishedAgentSite: false,
    customDomain: "artisanhomenetwork.com",
    ...ENGAGEMENT_DONE,
  };

  it("CANNOT reach 100% — 'Publish your website' has no external path", () => {
    const result = computeSiteHealth(keepsOwnSite);

    // Everything an agent who keeps their own site can possibly do is done.
    expect(result.completed).toBe(7);
    expect(result.score).toBe(88);
    expect(remainingSiteHealthTaskIds(keepsOwnSite)).toEqual(["website"]);
  });

  it("the blocking task only accepts an AgentStack-hosted site", () => {
    const websiteTask = computeSiteHealth(keepsOwnSite).tasks.find(
      (task) => task.id === "website"
    )!;

    // Neither a connected domain nor connected hosting satisfies it; the
    // completion rule reads published AgentStack documents only.
    expect(websiteTask.complete).toBe(false);
    expect(websiteTask.detail).toContain("AgentStack website");
    expect(websiteTask.action).toBe("Open Website Studio");
  });

  it("clears only once a site is published inside AgentStack", () => {
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
    customDomain: "artisanhomenetwork.com",
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
    const withDomain = { ...NOTHING, customDomain: "artisanhomenetwork.com" };
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
