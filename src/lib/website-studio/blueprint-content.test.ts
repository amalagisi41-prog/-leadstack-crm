import { describe, expect, it } from "vitest";
import { emptyAgentSiteContent } from "@/types/agent-site";
import { EMPTY_BUSINESS_PROFILE } from "@/types/business-profile";
import {
  hydrateAgentSiteFromBlueprint,
  isUntouchedAgentSite,
} from "./blueprint-content";

describe("website studio blueprint hydration", () => {
  it("fills an untouched draft from the approved blueprint", () => {
    const result = hydrateAgentSiteFromBlueprint(emptyAgentSiteContent(), {
      ...EMPTY_BUSINESS_PROFILE,
      agentName: "Jordan Avery",
      title: "REALTOR®",
      brokerage: "Avery Property Group LLC",
      phone: "(978) 555-0148",
      serviceAreas: "Connecticut and Massachusetts",
      services: ["buyers", "sellers"],
      specialties: "Agent matching; relocation",
      clientPromise: "Real estate guidance built around you.",
    });

    expect(result.agentName).toBe("Jordan Avery");
    expect(result.tagline).toBe("Real estate guidance built around you.");
    expect(result.specialties).toEqual([
      "Buyers",
      "Sellers",
      "Agent matching",
      "relocation",
    ]);
    expect(result.logoUrl).toBe("");
  });

  it("does not overwrite a customized draft", () => {
    const current = {
      ...emptyAgentSiteContent(),
      agentName: "Example Realty",
      tagline: "A custom headline",
    };
    const result = hydrateAgentSiteFromBlueprint(current, {
      ...EMPTY_BUSINESS_PROFILE,
      agentName: "Different Name",
    });

    expect(isUntouchedAgentSite(current)).toBe(false);
    expect(result).toBe(current);
  });
});
