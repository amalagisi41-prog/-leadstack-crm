import { describe, expect, it } from "vitest";
import { emptyAgentSiteContent } from "@/types/agent-site";
import {
  assessAgentSitePublishReadiness,
  hasPublishBlockers,
} from "./publish-readiness";

describe("agent site publish readiness", () => {
  it("blocks an incomplete draft", () => {
    const issues = assessAgentSitePublishReadiness(emptyAgentSiteContent());
    expect(hasPublishBlockers(issues)).toBe(true);
    expect(issues.some((issue) => issue.field === "privacyPolicyUrl")).toBe(
      true
    );
  });

  it("allows a complete identity and legal foundation with a license warning", () => {
    const content = emptyAgentSiteContent();
    Object.assign(content, {
      agentName: "Jordan Avery",
      brokerage: "Avery Property Group",
      phone: "203-555-0148",
      serviceAreas: "Fairfield County, CT",
    });
    Object.assign(content.compliance!, {
      privacyPolicyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    const issues = assessAgentSitePublishReadiness(content);
    expect(hasPublishBlockers(issues)).toBe(false);
    expect(issues.some((issue) => issue.severity === "warning")).toBe(true);
  });
});
