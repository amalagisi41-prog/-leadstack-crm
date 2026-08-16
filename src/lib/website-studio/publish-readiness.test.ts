import { describe, expect, it } from "vitest";
import { emptyAgentSiteContent } from "@/types/agent-site";
import {
  assessAgentSitePublishReadiness,
  hasPublishBlockers,
} from "./publish-readiness";
import { normalizeAgentSiteContent } from "@/types/agent-site";

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

describe("legacy document tolerance", () => {
  it("does not throw on a document with a partial compliance object", () => {
    // `compliance?.fairHousingStatement.trim()` guarded the object but not
    // the field, so this shape threw a 500 inside the publish route.
    const partial = {
      agentName: "Franco Malagisi",
      brokerage: "Marr & Caruso Realty Group LLC",
      phone: "978-622-2360",
      serviceAreas: "Connecticut, Massachusetts",
      compliance: { licenseNumber: "RES.0800123" },
    } as never;

    expect(() => assessAgentSitePublishReadiness(partial)).not.toThrow();
  });

  it("does not throw on a document with no compliance object at all", () => {
    expect(() =>
      assessAgentSitePublishReadiness({ agentName: "Jane Doe" } as never)
    ).not.toThrow();
  });

  it("reports the same blockers for a raw and a normalized document", () => {
    // The client assessed normalized state while the publish route assessed
    // the raw document, so the server could 409 a publish the UI had cleared.
    const raw = {
      agentName: "Franco Malagisi",
      brokerage: "Marr & Caruso Realty Group LLC",
      phone: "978-622-2360",
      serviceAreas: "Connecticut, Massachusetts",
    } as never;
    const normalized = normalizeAgentSiteContent(raw);

    expect(assessAgentSitePublishReadiness(raw)).toEqual(
      assessAgentSitePublishReadiness(normalized)
    );
  });

  it("still blocks a genuinely incomplete draft", () => {
    const issues = assessAgentSitePublishReadiness({} as never);
    expect(hasPublishBlockers(issues)).toBe(true);
    expect(issues.map((i) => i.field)).toContain("privacyPolicyUrl");
  });
});
