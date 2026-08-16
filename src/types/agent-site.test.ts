import { describe, expect, it } from "vitest";
import {
  emptyAgentSiteContent,
  normalizeAgentSiteContent,
  type AgentSiteContent,
} from "./agent-site";

/**
 * Regression cover for the "Application error: a client-side exception"
 * crash. A site document written before a field existed comes back from
 * Firestore without it; the editor then renders `content.metaTitle.length`
 * and takes down the whole client. Normalizing every read boundary is what
 * keeps a future field addition from breaking existing sites.
 */
describe("agent site content normalization", () => {
  it("fills SEO fields a legacy document predates", () => {
    // Exactly the shape that crashed: a doc from before SEO fields existed.
    const legacy = {
      agentName: "Franco Malagisi",
      tagline: "Personal connections. Professional results.",
    } as Partial<AgentSiteContent>;

    const normalized = normalizeAgentSiteContent(legacy);

    expect(normalized.metaTitle).toBe("");
    expect(normalized.metaDescription).toBe("");
    expect(normalized.ogImageUrl).toBe("");
    // The crash was `.length` on undefined — prove it is now safe.
    expect(() => normalized.metaTitle.length).not.toThrow();
    expect(normalized.agentName).toBe("Franco Malagisi");
  });

  it("keeps every stored value it was given", () => {
    const stored = {
      ...emptyAgentSiteContent(),
      agentName: "Jane Doe",
      metaTitle: "Jane Doe | Fairfield County Realtor",
    };
    expect(normalizeAgentSiteContent(stored)).toEqual(stored);
  });

  it("repairs array fields that are missing or explicitly null", () => {
    const broken = {
      specialties: null,
      listings: undefined,
    } as unknown as Partial<AgentSiteContent>;

    const normalized = normalizeAgentSiteContent(broken);

    // `.join` / `.map` in the editor would throw on either of these.
    expect(normalized.specialties).toEqual([]);
    expect(normalized.listings).toEqual([]);
    expect(normalized.testimonials).toEqual([]);
    expect(normalized.galleryUrls).toEqual([]);
    expect(() => normalized.specialties.join(", ")).not.toThrow();
  });

  it("fills a partial compliance object the publish checklist reads", () => {
    const partial = {
      compliance: { licenseNumber: "RES.0800123" },
    } as unknown as Partial<AgentSiteContent>;

    const normalized = normalizeAgentSiteContent(partial);

    expect(normalized.compliance?.licenseNumber).toBe("RES.0800123");
    expect(normalized.compliance?.privacyPolicyUrl).toBe("");
    expect(normalized.compliance?.fairHousingStatement).toContain(
      "equal housing opportunity"
    );
  });

  it("returns a complete object for null or undefined input", () => {
    expect(normalizeAgentSiteContent(null)).toEqual(emptyAgentSiteContent());
    expect(normalizeAgentSiteContent(undefined)).toEqual(
      emptyAgentSiteContent()
    );
  });
});
