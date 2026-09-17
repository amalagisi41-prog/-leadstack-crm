import { describe, expect, it } from "vitest";
import {
  contactLinksFromContent,
  extractStructuredProfile,
  normalizeEmail,
  normalizePhone,
  parseJsonLd,
} from "./structured-profile";

/**
 * The gap this closes: a Crexi profile read cleanly and still came back at
 * 29%, because the page declares the agent in schema.org JSON-LD — and the
 * text cleanup strips every <script> tag before the model or any extractor
 * sees the page. The page's own machine-readable declaration is the one
 * source that needs no model at all.
 */

/** Shaped like a commercial-portal agent profile (the Crexi case). */
const PORTAL_HTML = `<!doctype html><html><head>
<title>Agent Profile</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"Person","name":"Jordan Rivera","jobTitle":"Commercial Broker",
   "worksFor":{"@type":"Organization","name":"Example Realty Group"},
   "telephone":"+1 203-555-0100","email":"jordan@example.com",
   "url":"https://example-realty.test/",
   "image":"https://cdn.example.com/photos/jordan.jpg",
   "address":{"@type":"PostalAddress","addressLocality":"Stamford","addressRegion":"CT"},
   "description":"Jordan has represented buyers and sellers of commercial property across Fairfield County for twenty years, closing over one hundred transactions."}
]}
</script>
<script>window.__NUXT__ = {/* app bootstrap the cleanup rightly strips */};</script>
</head><body><div id="app"></div></body></html>`;

/** A brokerage's own site: LocalBusiness, no Person node. */
const BROKERAGE_HTML = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness",
 "name":"Example Realty","telephone":"(203) 555-0100",
 "email":"mailto:HELLO@example-realty.test",
 "areaServed":["Stamford","Norwalk","Fairfield"],
 "url":"https://example-realty.test"}
</script></head><body>Welcome</body></html>`;

const SOURCE = "https://www.crexi.com/profile/jordan-rivera-jordanre";

const PROFILE_PAGE_HTML = `<script type="application/ld+json">
{"@type":"ProfilePage","mainEntity":{"@type":["Person","RealEstateAgent"],"name":"Jordan Rivera","jobTitle":"Real Estate Agent","worksFor":{"@type":"Organization","name":"Example Realty Group"},"telephone":"(203) 555-0100","areaServed":[{"@type":"City","name":"Stamford"}],"description":"Jordan serves buyers and sellers throughout Fairfield County with a practical, local approach to real estate."}}
</script>`;

const SUB_ORGANIZATION_HTML = `<script type="application/ld+json">
{"@type":"RealEstateAgent","name":"Jordan Rivera","memberOf":{"@type":"Organization","name":"National Association of Realtors"},"subOrganization":{"@type":"Organization","name":"Example And Rivera Realty Group"}}
</script>`;

describe("parsing what the page declares", () => {
  it("reads a Person out of an @graph, including nested brokerage", () => {
    const profile = extractStructuredProfile({
      raw: PORTAL_HTML,
      kind: "html",
      url: SOURCE,
    });

    expect(profile.agentName).toBe("Jordan Rivera");
    expect(profile.title).toBe("Commercial Broker");
    expect(profile.brokerage).toBe("Example Realty Group");
    expect(profile.phone).toBe("(203) 555-0100");
    expect(profile.email).toBe("jordan@example.com");
    expect(profile.website).toBe("https://example-realty.test/");
    expect(profile.headshotUrl).toBe("https://cdn.example.com/photos/jordan.jpg");
    expect(profile.serviceAreas).toBe("Stamford, CT");
    expect(profile.bio).toMatch(/Fairfield County for twenty years/);
  });

  it("reads a brokerage site's LocalBusiness without inventing a person", () => {
    const profile = extractStructuredProfile({
      raw: BROKERAGE_HTML,
      kind: "html",
      url: "https://example-realty.test/",
    });

    expect(profile.agentName).toBeUndefined();
    expect(profile.brokerage).toBe("Example Realty");
    expect(profile.phone).toBe("(203) 555-0100");
    expect(profile.email).toBe("hello@example-realty.test");
    expect(profile.serviceAreas).toBe("Stamford, Norwalk, Fairfield");
  });

  it("survives one broken JSON-LD block without losing the others", () => {
    // Analytics vendors ship malformed blocks routinely; one bad script must
    // not cost the page its real declaration.
    const html = `<script type="application/ld+json">{broken json</script>${PORTAL_HTML}`;
    const profile = extractStructuredProfile({ raw: html, kind: "html", url: SOURCE });
    expect(profile.agentName).toBe("Jordan Rivera");
  });

  it("returns nothing for a page that declares nothing", () => {
    expect(
      extractStructuredProfile({
        raw: "<html><body><h1>Hello</h1></body></html>",
        kind: "html",
        url: SOURCE,
      })
    ).toEqual({});
  });

  it("finds several blocks, not just the first", () => {
    const nodes = parseJsonLd(
      `<script type="application/ld+json">{"@type":"WebSite","name":"x"}</script>
       <script type='application/ld+json'>{"@type":"Person","name":"Jane Doe"}</script>`
    );
    expect(nodes.length).toBe(2);
  });

  it("reads an agent nested under ProfilePage.mainEntity", () => {
    const profile = extractStructuredProfile({
      raw: PROFILE_PAGE_HTML,
      kind: "html",
      url: "https://www.homes.com/real-estate-agents/jordan-rivera/jx0kjz7/",
    });
    expect(profile.agentName).toBe("Jordan Rivera");
    expect(profile.brokerage).toBe("Example Realty Group");
    expect(profile.phone).toBe("(203) 555-0100");
    expect(profile.serviceAreas).toBe("Stamford");
  });

  it("prefers a brokerage subOrganization over a professional membership", () => {
    const profile = extractStructuredProfile({
      raw: SUB_ORGANIZATION_HTML,
      kind: "html",
      url: "https://www.realtor.com/realestateagents/5911496b85620000113b785e",
    });
    expect(profile.brokerage).toBe("Example And Rivera Realty Group");
  });
});

describe("what must never come out of structure", () => {
  it("never lets the directory's own URL become the agent's website", () => {
    const html = PORTAL_HTML.replace(
      "https://example-realty.test/",
      "https://www.crexi.com/profile/jordan-rivera-jordanre"
    );
    const profile = extractStructuredProfile({ raw: html, kind: "html", url: SOURCE });
    expect(profile.website).toBeUndefined();
  });

  it("drops an org node that just repeats the agent's name as brokerage", () => {
    const html = `<script type="application/ld+json">
      [{"@type":"Person","name":"Jane Doe"},{"@type":"Organization","name":"Jane Doe"}]
    </script>`;
    const profile = extractStructuredProfile({ raw: html, kind: "html", url: SOURCE });
    expect(profile.brokerage).toBeUndefined();
  });

  it("rejects a single-word name and UI copy posing as a name", () => {
    for (const bad of ["Jordan", "Report a problem Jordan Rivera reviews"]) {
      const html = `<script type="application/ld+json">{"@type":"Person","name":"${bad}"}</script>`;
      expect(
        extractStructuredProfile({ raw: html, kind: "html", url: SOURCE }).agentName
      ).toBeUndefined();
    }
  });

  it("never maps a licence number, whatever the page claims", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Person","name":"Jane Doe","identifier":"RES.0000000","licenseNumber":"RES.0000000"}
    </script>`;
    const profile = extractStructuredProfile({ raw: html, kind: "html", url: SOURCE });
    expect(profile.licenseNumber).toBeUndefined();
  });

  it("treats a short description as a tagline, not a bio", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Person","name":"Jane Doe","description":"Top agent."}
    </script>`;
    expect(
      extractStructuredProfile({ raw: html, kind: "html", url: SOURCE }).bio
    ).toBeUndefined();
  });
});

describe("contact links, in HTML and reader markdown alike", () => {
  it("reads tel: and mailto: out of reader markdown", () => {
    const markdown = `# Jordan Rivera
[Call (203) 555-0100](tel:%28203%29%20555-0100) · [Email](mailto:jordan@example.com?subject=Hi)`;
    const links = contactLinksFromContent(markdown);
    expect(links.phone).toBe("(203) 555-0100");
    expect(links.email).toBe("jordan@example.com");
  });

  it("feeds those links into the profile for markdown sources", () => {
    const profile = extractStructuredProfile({
      raw: `[Call](tel:12035550100)`,
      kind: "markdown",
      url: SOURCE,
    });
    expect(profile.phone).toBe("(203) 555-0100");
  });
});

describe("normalisation", () => {
  it("formats any plausible US phone the same way", () => {
    for (const raw of ["203-555-0100", "(203) 555 0100", "+1 203.555.0100", "tel:12035550100"]) {
      expect(normalizePhone(raw)).toBe("(203) 555-0100");
    }
  });

  it("rejects digit strings that are not phone numbers", () => {
    expect(normalizePhone("12345")).toBe("");
    expect(normalizePhone("555-01")).toBe("");
    expect(normalizePhone("+44 20 7946 0958")).toBe(""); // non-US shapes: leave for the model
  });

  it("lowercases and strips mailto and query noise from emails", () => {
    expect(normalizeEmail("mailto:Jordan.Rivera@Example.com?subject=hi")).toBe(
      "jordan.rivera@example.com"
    );
    expect(normalizeEmail("not-an-email")).toBe("");
  });
});
