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
  {"@type":"Person","name":"Seamus Costigan","jobTitle":"Commercial Broker",
   "worksFor":{"@type":"Organization","name":"Marr Caruso Realty Group"},
   "telephone":"+1 203-550-0531","email":"sc.newbridge@gmail.com",
   "url":"https://newbridge-properties.com/",
   "image":"https://cdn.example.com/photos/seamus.jpg",
   "address":{"@type":"PostalAddress","addressLocality":"Stamford","addressRegion":"CT"},
   "description":"Seamus has represented buyers and sellers of commercial property across Fairfield County for twenty years, closing over one hundred transactions."}
]}
</script>
<script>window.__NUXT__ = {/* app bootstrap the cleanup rightly strips */};</script>
</head><body><div id="app"></div></body></html>`;

/** A brokerage's own site: LocalBusiness, no Person node. */
const BROKERAGE_HTML = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness",
 "name":"Newbridge Properties","telephone":"(203) 550-0531",
 "email":"mailto:HELLO@Newbridge-Properties.com",
 "areaServed":["Stamford","Norwalk","Fairfield"],
 "url":"https://newbridge-properties.com"}
</script></head><body>Welcome</body></html>`;

const SOURCE = "https://www.crexi.com/profile/seamus-costigan-seamusco";

describe("parsing what the page declares", () => {
  it("reads a Person out of an @graph, including nested brokerage", () => {
    const profile = extractStructuredProfile({
      raw: PORTAL_HTML,
      kind: "html",
      url: SOURCE,
    });

    expect(profile.agentName).toBe("Seamus Costigan");
    expect(profile.title).toBe("Commercial Broker");
    expect(profile.brokerage).toBe("Marr Caruso Realty Group");
    expect(profile.phone).toBe("(203) 550-0531");
    expect(profile.email).toBe("sc.newbridge@gmail.com");
    expect(profile.website).toBe("https://newbridge-properties.com/");
    expect(profile.headshotUrl).toBe("https://cdn.example.com/photos/seamus.jpg");
    expect(profile.serviceAreas).toBe("Stamford, CT");
    expect(profile.bio).toMatch(/Fairfield County for twenty years/);
  });

  it("reads a brokerage site's LocalBusiness without inventing a person", () => {
    const profile = extractStructuredProfile({
      raw: BROKERAGE_HTML,
      kind: "html",
      url: "https://newbridge-properties.com/",
    });

    expect(profile.agentName).toBeUndefined();
    expect(profile.brokerage).toBe("Newbridge Properties");
    expect(profile.phone).toBe("(203) 550-0531");
    expect(profile.email).toBe("hello@newbridge-properties.com");
    expect(profile.serviceAreas).toBe("Stamford, Norwalk, Fairfield");
  });

  it("survives one broken JSON-LD block without losing the others", () => {
    // Analytics vendors ship malformed blocks routinely; one bad script must
    // not cost the page its real declaration.
    const html = `<script type="application/ld+json">{broken json</script>${PORTAL_HTML}`;
    const profile = extractStructuredProfile({ raw: html, kind: "html", url: SOURCE });
    expect(profile.agentName).toBe("Seamus Costigan");
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
});

describe("what must never come out of structure", () => {
  it("never lets the directory's own URL become the agent's website", () => {
    const html = PORTAL_HTML.replace(
      "https://newbridge-properties.com/",
      "https://www.crexi.com/profile/seamus-costigan-seamusco"
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
    for (const bad of ["Seamus", "Report a problem Seamus Costigan reviews"]) {
      const html = `<script type="application/ld+json">{"@type":"Person","name":"${bad}"}</script>`;
      expect(
        extractStructuredProfile({ raw: html, kind: "html", url: SOURCE }).agentName
      ).toBeUndefined();
    }
  });

  it("never maps a licence number, whatever the page claims", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Person","name":"Jane Doe","identifier":"RES.0836613","licenseNumber":"RES.0836613"}
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
    const markdown = `# Seamus Costigan
[Call (203) 550-0531](tel:%28203%29%20550-0531) · [Email](mailto:sc.newbridge@gmail.com?subject=Hi)`;
    const links = contactLinksFromContent(markdown);
    expect(links.phone).toBe("(203) 550-0531");
    expect(links.email).toBe("sc.newbridge@gmail.com");
  });

  it("feeds those links into the profile for markdown sources", () => {
    const profile = extractStructuredProfile({
      raw: `[Call](tel:12035500531)`,
      kind: "markdown",
      url: SOURCE,
    });
    expect(profile.phone).toBe("(203) 550-0531");
  });
});

describe("normalisation", () => {
  it("formats any plausible US phone the same way", () => {
    for (const raw of ["203-550-0531", "(203) 550 0531", "+1 203.550.0531", "tel:12035500531"]) {
      expect(normalizePhone(raw)).toBe("(203) 550-0531");
    }
  });

  it("rejects digit strings that are not phone numbers", () => {
    expect(normalizePhone("12345")).toBe("");
    expect(normalizePhone("555-01")).toBe("");
    expect(normalizePhone("+44 20 7946 0958")).toBe(""); // non-US shapes: leave for the model
  });

  it("lowercases and strips mailto and query noise from emails", () => {
    expect(normalizeEmail("mailto:SC.Newbridge@Gmail.com?subject=hi")).toBe(
      "sc.newbridge@gmail.com"
    );
    expect(normalizeEmail("not-an-email")).toBe("");
  });
});
