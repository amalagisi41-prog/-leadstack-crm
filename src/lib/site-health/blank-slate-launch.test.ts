import { describe, expect, it } from "vitest";
import {
  computeSiteHealth,
  remainingSiteHealthTaskIds,
  type SiteHealthInputs,
} from "./tasks";

const blankSlate: SiteHealthInputs = {
  profile: {},
  publishedWebsite: false,
  publishedAgentSite: false,
  customDomain: "",
  domainVerified: false,
  hasLeadForm: false,
  hasBookingPage: false,
  webChatEnabled: false,
  businessEmailVerified: false,
};

const completeProfile = {
  completeness: 100,
  brokerage: "Example Realty",
  licenseNumber: "RE-123456",
  fairHousing: true,
  noLegalTaxAdvice: true,
  optOutLanguage: "Reply STOP to opt out.",
};

describe("blank-slate new-client launch path", () => {
  it("starts honestly at 0% with a deterministic priority order", () => {
    expect(computeSiteHealth(blankSlate)).toMatchObject({
      score: 0,
      completed: 0,
      total: 8,
    });
    expect(remainingSiteHealthTaskIds(blankSlate)).toEqual([
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

  it("records domain setup separately from live website verification", () => {
    const configured = {
      ...blankSlate,
      profile: completeProfile,
      customDomain: "example-realty.test",
    };

    expect(computeSiteHealth(configured).score).toBe(38);
    expect(remainingSiteHealthTaskIds(configured)).not.toContain("domain");
    expect(remainingSiteHealthTaskIds(configured)).toContain("website");
  });

  it("reaches 100% only after the site and every launch channel are live", () => {
    const launchReady: SiteHealthInputs = {
      ...blankSlate,
      profile: completeProfile,
      publishedAgentSite: true,
      customDomain: "example-realty.test",
      domainVerified: true,
      hasLeadForm: true,
      hasBookingPage: true,
      webChatEnabled: true,
      businessEmailVerified: true,
    };

    expect(computeSiteHealth(launchReady)).toMatchObject({
      score: 100,
      completed: 8,
      total: 8,
    });
    expect(remainingSiteHealthTaskIds(launchReady)).toEqual([]);
  });
});
