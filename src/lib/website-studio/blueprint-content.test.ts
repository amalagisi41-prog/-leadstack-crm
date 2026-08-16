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
      agentName: "Franco Malagisi",
      title: "REALTOR®",
      brokerage: "Marr & Caruso Realty Group LLC",
      phone: "(978) 622-2360",
      serviceAreas: "Connecticut and Massachusetts",
      services: ["buyers", "sellers"],
      specialties: "Agent matching; relocation",
      clientPromise: "Real estate guidance built around you.",
    });

    expect(result.agentName).toBe("Franco Malagisi");
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
