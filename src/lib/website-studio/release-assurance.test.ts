import { describe, expect, it } from "vitest";
import { emptyAgentSiteContent } from "@/types/agent-site";
import { defaultAgentSiteComposition } from "./site-composition";
import { assessAgentSiteReleaseAssurance } from "./release-assurance";

function completeContent() {
  const content = emptyAgentSiteContent();
  Object.assign(content, {
    agentName: "Jordan Avery",
    brokerage: "Avery Realty",
    phone: "203-555-0100",
    serviceAreas: "Fairfield County",
    heroImageUrl: "https://example.com/hero.jpg",
  });
  Object.assign(content.compliance!, {
    privacyPolicyUrl: "https://example.com/privacy",
    termsUrl: "https://example.com/terms",
    licenseStates: "CT",
    licenseNumber: "RES.123",
  });
  return content;
}

describe("website release assurance", () => {
  it("passes a complete candidate with a rollback target", () => {
    const report = assessAgentSiteReleaseAssurance({
      content: completeContent(),
      composition: defaultAgentSiteComposition(),
      slug: "jordan-avery",
      idxConnected: true,
      hasRollbackRevision: true,
    });
    expect(report.passed).toBe(true);
    expect(report.testedViewports).toHaveLength(5);
  });

  it("blocks insecure assets and a missing rollback target", () => {
    const content = completeContent();
    content.logoUrl = "http://example.com/logo.png";
    const report = assessAgentSiteReleaseAssurance({
      content,
      composition: defaultAgentSiteComposition(),
      slug: "jordan-avery",
      idxConnected: false,
      hasRollbackRevision: false,
    });
    expect(report.passed).toBe(false);
    expect(
      report.checks.some(
        (check) => check.id === "secure-assets" && check.status === "blocked"
      )
    ).toBe(true);
    expect(
      report.checks.some(
        (check) =>
          check.id === "rollback-revision" && check.status === "blocked"
      )
    ).toBe(true);
  });
});
