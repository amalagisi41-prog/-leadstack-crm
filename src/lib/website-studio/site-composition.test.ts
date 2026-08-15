import { describe, expect, it } from "vitest";
import {
  AGENT_SITE_SECTION_ORDER,
  defaultAgentSiteComposition,
  normalizeAgentSiteComposition,
} from "./site-composition";

describe("AgentSite composition", () => {
  it("creates a complete default page", () => {
    const composition = defaultAgentSiteComposition();
    expect(composition.version).toBe(1);
    expect(composition.sections.map((section) => section.type)).toEqual(
      AGENT_SITE_SECTION_ORDER
    );
    expect(
      composition.sections.find((section) => section.type === "idx")?.visible
    ).toBe(false);
  });

  it("preserves valid order and visibility while repairing missing sections", () => {
    const composition = normalizeAgentSiteComposition({
      sections: [
        { id: "testimonials", type: "testimonials", visible: false },
        { id: "hero", type: "hero", visible: false },
        { id: "unknown", type: "unknown", visible: true },
        { id: "hero-copy", type: "hero", visible: true },
      ],
    });

    expect(composition.sections[0]).toEqual({
      id: "testimonials",
      type: "testimonials",
      visible: false,
    });
    expect(composition.sections[1]).toEqual({
      id: "hero",
      type: "hero",
      visible: true,
    });
    expect(
      new Set(composition.sections.map((section) => section.type)).size
    ).toBe(AGENT_SITE_SECTION_ORDER.length);
  });

  it("falls back safely for legacy or malformed data", () => {
    expect(normalizeAgentSiteComposition(undefined)).toEqual(
      defaultAgentSiteComposition()
    );
    expect(normalizeAgentSiteComposition({ sections: "bad" })).toEqual(
      defaultAgentSiteComposition()
    );
  });
});
