import { describe, expect, it } from "vitest";
import { defaultAgentSiteComposition } from "./site-composition";
import { compositionToPuckData, puckDataToComposition } from "./puck-adapter";

describe("Puck composition adapter", () => {
  it("keeps hidden sections out of the Puck canvas", () => {
    const data = compositionToPuckData(defaultAgentSiteComposition());
    expect(data.content.some((item) => item.type === "IdxListings")).toBe(
      false
    );
  });

  it("converts reordered Puck blocks back to the site composition", () => {
    const previous = defaultAgentSiteComposition();
    const data = compositionToPuckData(previous);
    const hero = data.content.find((item) => item.type === "Hero")!;
    const footer = data.content.find((item) => item.type === "SiteFooter")!;
    const remaining = data.content.filter(
      (item) => item.type !== "Hero" && item.type !== "SiteFooter"
    );
    const next = puckDataToComposition(
      { content: [hero, ...remaining, footer] },
      previous
    );
    expect(next.sections[0].type).toBe("hero");
    expect(next.sections.at(-1)?.type).toBe("idx");
    expect(
      next.sections.find((section) => section.type === "idx")?.visible
    ).toBe(false);
  });
});
