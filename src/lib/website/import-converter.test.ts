import { describe, it, expect } from "vitest";

import {
  extractFromMarkdown,
  convertToWebsiteConfig,
  normalizeImportUrl,
  importWebsiteFromDomain,
} from "./import-converter";
import { validateWebsiteConfig } from "./validation";

describe("normalizeImportUrl", () => {
  it("adds https:// to a bare domain", () => {
    expect(normalizeImportUrl("acmerealty.com").toString()).toBe(
      "https://acmerealty.com/",
    );
  });

  it("preserves an explicit scheme", () => {
    expect(normalizeImportUrl("http://acmerealty.com").protocol).toBe("http:");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeImportUrl("  acmerealty.com  ").hostname).toBe(
      "acmerealty.com",
    );
  });

  it.each([
    ["", "empty input"],
    ["localhost", "localhost"],
    ["localhost:3000", "localhost with port"],
    ["169.254.169.254", "cloud metadata IP"],
    ["127.0.0.1", "loopback IP"],
    ["intranet", "bare hostname with no dot"],
    ["files.internal", ".internal TLD"],
    ["printer.local", ".local TLD"],
  ])("rejects %s (%s)", (input) => {
    expect(() => normalizeImportUrl(input)).toThrow();
  });

  it("rejects non-http schemes", () => {
    expect(() => normalizeImportUrl("ftp://acmerealty.com")).toThrow(
      /only http/i,
    );
  });
});

describe("extractFromMarkdown", () => {
  it("pulls the H1 as title and hero statement", () => {
    const data = extractFromMarkdown("# Acme Realty\n\nWe sell homes.");
    expect(data.title).toBe("Acme Realty");
    expect(data.heroStatement).toBe("Acme Realty");
  });

  it("collects list items under a features heading", () => {
    const data = extractFromMarkdown(
      "# Acme\n\n## Our Services\n\n- Buying\n- Selling\n- Renting",
    );
    expect(data.features).toBe("Buying, Selling, Renting");
  });

  it("stops collecting when a non-features heading follows", () => {
    const data = extractFromMarkdown(
      "# Acme\n\n## Services\n\n- Buying\n\n## Contact Us\n\n- 555-1234\n- Mon-Fri",
    );
    expect(data.features).toBe("Buying");
    expect(data.features).not.toContain("555-1234");
  });

  it("caps features at the 60 characters validateWebsiteConfig allows", () => {
    const data = extractFromMarkdown(
      "## Services\n\n" +
        [
          "Residential property sales",
          "Commercial leasing services",
          "Property management",
          "Investment advisory",
        ]
          .map((s) => `- ${s}`)
          .join("\n"),
    );
    expect(data.features!.length).toBeLessThanOrEqual(60);
  });

  it("skips platform and no-reply addresses in favour of a real business one", () => {
    const data = extractFromMarkdown(
      [
        "# Acme Realty",
        "",
        "Questions? no-reply@acmerealty.com",
        "Built by hello@squarespace.com",
        "Reach us at broker@acmerealty.com",
      ].join("\n"),
    );
    expect(data.contactEmail).toBe("broker@acmerealty.com");
  });

  it("leaves contactEmail undefined when only junk addresses are present", () => {
    const data = extractFromMarkdown("# Acme\n\nwebmaster@example.com");
    expect(data.contactEmail).toBeUndefined();
  });
});

describe("convertToWebsiteConfig — never invents values", () => {
  it("leaves unresolved fields empty rather than filling placeholders", () => {
    const config = convertToWebsiteConfig({}, undefined);

    expect(config.contact_details).toBe("");
    expect(config.cta_link).toBe("");
    expect(config.features).toBe("");
    expect(config.benefits).toBe("");
    expect(config.business_details?.business_country).toBe("");
  });

  it("never emits an example.com placeholder anywhere", () => {
    const serialized = JSON.stringify(convertToWebsiteConfig({}, undefined));
    expect(serialized).not.toContain("example.com");
  });

  it("an empty import fails validation, so it cannot reach Build", () => {
    const errors = validateWebsiteConfig(convertToWebsiteConfig({}, undefined));

    // The operator is told exactly which fields still need them.
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining([
        "heading",
        "hero_statement",
        "features",
        "benefits",
        "contact_details",
        "cta_link",
      ]),
    );
  });

  it("uses the operator's own domain for the CTA link", () => {
    const config = convertToWebsiteConfig(
      {},
      new URL("https://acmerealty.com/about"),
    );
    expect(config.cta_link).toBe("https://acmerealty.com");
  });

  it("clamps heading and hero to the 80-char validation limit", () => {
    const long = "Acme Realty ".repeat(30);
    const config = convertToWebsiteConfig(
      { title: long, heroStatement: long },
      new URL("https://acmerealty.com"),
    );

    expect(config.heading.length).toBeLessThanOrEqual(80);
    expect(config.hero_statement.length).toBeLessThanOrEqual(80);

    const errors = validateWebsiteConfig(config);
    expect(errors.heading).toBeUndefined();
    expect(errors.hero_statement).toBeUndefined();
  });

  it("a well-scraped import clears every field a scrape can actually know", () => {
    const config = convertToWebsiteConfig(
      {
        title: "Acme Realty",
        heroStatement: "Homes that fit your life",
        features: "Buying, Selling, Renting",
        benefits: "Local, Fast, Honest",
        contactEmail: "broker@acmerealty.com",
      },
      new URL("https://acmerealty.com"),
    );

    const errors = validateWebsiteConfig(config);

    // The only outstanding items are the street address and city, which a
    // page scrape cannot reliably determine and which we refuse to invent.
    // The contact page requires them, so validation holds the build until
    // the operator supplies them — naming the two fields rather than
    // publishing a contact page with a made-up address on it.
    expect(Object.keys(errors).sort()).toEqual([
      "business_details.business_city",
      "business_details.business_street",
    ]);
  });
});

describe("importWebsiteFromDomain", () => {
  it("scrapes the normalized URL and prefers the scraped title", async () => {
    let scrapedUrl = "";
    const config = await importWebsiteFromDomain("acmerealty.com", async (u) => {
      scrapedUrl = u;
      return {
        markdown: "# Ignored H1\n\n## Services\n\n- Buying\n- Selling",
        title: "Acme Realty | Homes",
      };
    });

    expect(scrapedUrl).toBe("https://acmerealty.com/");
    expect(config.heading).toBe("Acme Realty | Homes");
    expect(config.features).toBe("Buying, Selling");
  });

  it("rejects a bad address before calling the scraper", async () => {
    let called = false;
    await expect(
      importWebsiteFromDomain("localhost", async () => {
        called = true;
        return { markdown: "", title: null };
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
});
