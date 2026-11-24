import { describe, expect, it } from "vitest";
import { parseListingsFromMarkdown } from "./listings-scrape";

const SAMPLE_PAGE = `
For sale · Greenwich
Townhouse living near downtown.
29 Division Street West #3 · Greenwich, Connecticut

$749,000
For sale · Stamford
Water views from a raised ranch.
303 Weed Avenue · Stamford, Connecticut

$799,000
For sale · Stamford
A classic colonial on a level lot.
151 Sun Dance Road · Stamford, Connecticut

$965,000
Under contract · Westover
Rebuilt for modern living.
1076 Westover Road · Stamford, Connecticut

$2,399,000
Under contract · Shippan
A Shippan waterfront community home.
3 Westminster Road · Stamford, Connecticut

$1,495,000
Sold · Springdale
Three units. One flexible investment.
20 Cerretta Street · Stamford, Connecticut

$995,000
For sale · Probate · As-is
A Newfield probate sale offered as-is.
39 Crane Road · Stamford, Connecticut

$875,000
`;

describe("parseListingsFromMarkdown", () => {
  it("extracts all seven cards from a real listings page", () => {
    const cards = parseListingsFromMarkdown(SAMPLE_PAGE);
    expect(cards).toHaveLength(7);
    expect(cards.map((c) => c.address)).toEqual([
      "29 Division Street West #3",
      "303 Weed Avenue",
      "151 Sun Dance Road",
      "1076 Westover Road",
      "3 Westminster Road",
      "20 Cerretta Street",
      "39 Crane Road",
    ]);
  });

  it("normalizes the state to a 2-letter code", () => {
    const [card] = parseListingsFromMarkdown(SAMPLE_PAGE);
    expect(card.city).toBe("Greenwich");
    expect(card.state).toBe("CT");
  });

  it("parses the price", () => {
    const cards = parseListingsFromMarkdown(SAMPLE_PAGE);
    expect(cards[0].price).toBe(749000);
    expect(cards[3].price).toBe(2399000);
  });

  it("maps status text to the app's marketing-status vocabulary", () => {
    const cards = parseListingsFromMarkdown(SAMPLE_PAGE);
    expect(cards[0].marketingStatus).toBe("active"); // "For sale"
    expect(cards[3].marketingStatus).toBe("under-contract");
    expect(cards[5].marketingStatus).toBe("just-sold"); // "Sold"
  });

  it("keeps extra header segments as tags rather than mistaking them for the city", () => {
    const probate = parseListingsFromMarkdown(SAMPLE_PAGE)[6];
    expect(probate.tags).toEqual(["Probate", "As-is"]);
    // The real city comes from the address line, not the header segment.
    expect(probate.city).toBe("Stamford");
  });

  it("captures the one-line description as remarks", () => {
    const [card] = parseListingsFromMarkdown(SAMPLE_PAGE);
    expect(card.remarks).toBe("Townhouse living near downtown.");
  });

  it("returns nothing for a page with no recognizable status lines", () => {
    expect(parseListingsFromMarkdown("Welcome to our site.\n\nContact us today.")).toEqual(
      [],
    );
  });

  it("skips a card whose price line never appears", () => {
    const incomplete = `
For sale · Greenwich
A property with no price.
1 Test Street · Greenwich, Connecticut
`;
    expect(parseListingsFromMarkdown(incomplete)).toEqual([]);
  });
});
