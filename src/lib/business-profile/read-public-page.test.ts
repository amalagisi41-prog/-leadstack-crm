import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firecrawl/client", () => ({
  firecrawlIsConfigured: vi.fn(() => false),
  scrapeUrl: vi.fn(),
  FirecrawlError: class FirecrawlError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { firecrawlIsConfigured, scrapeUrl } from "@/lib/firecrawl/client";
import {
  PageReadError,
  classifyPageText,
  configuredReaderApiKey,
  mostInformative,
  readFailureMessage,
  readPublicPage,
  readerUrl,
  safePublicUrl,
} from "./read-public-page";

/**
 * The bug this file exists for: a new operator pastes their Homes.com agent
 * profile into the Business Blueprint — the very first screen of the product —
 * and gets back "Could not read that website." with no reason and nothing to
 * do next.
 *
 * Two separate faults produced that. The reader-service fallback built a URL
 * with two schemes in it, so it failed on every call regardless of the target;
 * and the route's catch replaced every specific message with the generic one,
 * so even the failures that *were* diagnosed said nothing.
 */

const PROFILE = "https://www.homes.com/real-estate-agents/jane-doe/abc123/";
const ZILLOW_PROFILE = "https://www.zillow.com/profile/Seamus%20Costigan";

/** A page with enough text to look like a real bio. */
const BIO = `<html><body><h1>Jane Doe</h1><p>${"Jane has helped families buy and sell across the county for eleven years. ".repeat(
  12
)}</p></body></html>`;

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(firecrawlIsConfigured).mockReturnValue(false);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("the reader-service URL", () => {
  it("does not prefix a second scheme onto an absolute URL", () => {
    // `https://r.jina.ai/http://https://www.homes.com/...` is what the old
    // template produced, and it is why the rescue path never once worked.
    const built = readerUrl(PROFILE);
    expect(built).toBe(`https://r.jina.ai/${PROFILE}`);
    expect(built).not.toMatch(/http:\/\/https:/);
    expect(built.split("://").length).toBe(3); // r.jina.ai, then the target
  });

  it("keeps the target's own path and query intact", () => {
    const target = "https://example.com/agents/jane?ref=card";
    expect(readerUrl(target)).toBe(`https://r.jina.ai/${target}`);
  });
});

describe("reader key migration", () => {
  it("uses a valid legacy key when the corrected variable is malformed", () => {
    vi.stubEnv("JINA_READER_API_KEY", "reader-secret");
    vi.stubEnv("INA_READER_API_KEY", "jina_legacy-valid-key");
    expect(configuredReaderApiKey()).toEqual({
      value: "jina_legacy-valid-key",
      source: "INA_READER_API_KEY",
    });
  });
});

describe("telling a wall apart from a page", () => {
  it("spots a Cloudflare interstitial however long the page is", () => {
    const padded = `Attention Required! | Cloudflare ${"filler text ".repeat(400)}`;
    expect(classifyPageText(padded)).toBe("blocked");
  });

  it("spots the short access-denied walls the portals return", () => {
    expect(classifyPageText("Access Denied. Reference #18.2f")).toBe("blocked");
    expect(classifyPageText("Just a moment...")).toBe("blocked");
    expect(
      classifyPageText("You don't have permission to access this resource.")
    ).toBe("blocked");
  });

  it("does not call a long bio a wall because of one stray phrase", () => {
    // "Access denied" is a coincidence inside forty thousand characters of
    // listing copy; on a four-hundred-character page it is the whole page.
    const bio = `Access denied entry is never something Jane says. ${"She sells houses. ".repeat(
      200
    )}`;
    expect(classifyPageText(bio)).toBe("readable");
  });

  it("calls a page with no text thin rather than readable", () => {
    // A JS-rendered portal profile: 200 OK, a nav bar, and nothing else.
    expect(classifyPageText("Homes.com Search Buy Rent Sign in")).toBe("thin");
  });

  it("accepts an ordinary agent bio", () => {
    expect(
      classifyPageText("Jane Doe, REALTOR. ".repeat(40))
    ).toBe("readable");
  });
});

describe("what the operator is told", () => {
  it("names the portal, and gives them somewhere else to go", () => {
    const message = readFailureMessage("blocked", PROFILE);
    expect(message).toMatch(/Homes\.com/);
    expect(message).toMatch(/blocks automated reading/i);
    expect(message).toMatch(/brokerage or personal website/i);
  });

  it("always offers manual entry as the route that cannot fail", () => {
    // The rule this whole module encodes: no branch leaves them stuck.
    const reasons = [
      "blocked",
      "private",
      "provider-error",
      "unreadable",
      "unreachable",
    ] as const;
    for (const reason of reasons) {
      expect(readFailureMessage(reason, PROFILE), reason).toMatch(
        /fill your Blueprint in by hand/i
      );
    }
  });

  it("gives a next step even where manual entry is not the point", () => {
    // A dead link or a PDF has a better answer than "type it all in".
    expect(readFailureMessage("missing", PROFILE)).toMatch(
      /Open the link in your browser/i
    );
    expect(readFailureMessage("not-a-page", PROFILE)).toMatch(
      /address of the page it sits on/i
    );
  });

  it("never says only that it could not read the website", () => {
    const reasons = [
      "blocked",
      "missing",
      "private",
      "provider-error",
      "not-a-page",
      "unreadable",
      "unreachable",
    ] as const;
    for (const reason of reasons) {
      const message = readFailureMessage(reason, PROFILE);
      expect(message, reason).not.toBe("Could not read that website.");
      // Every message names an action, not just a state.
      expect(message.length, reason).toBeGreaterThan(60);
    }
  });

  it("falls back to the bare host for a site it does not know", () => {
    expect(readFailureMessage("blocked", "https://www.janedoerealty.com/about")).toMatch(
      /^janedoerealty\.com blocks/
    );
  });

  it("includes the status when the fault is on their server", () => {
    expect(readFailureMessage("provider-error", PROFILE, 503)).toMatch(/\(503\)/);
  });
});

describe("choosing which failure to report", () => {
  it("prefers a definite statement about their link over a transport error", () => {
    expect(
      mostInformative([{ reason: "unreachable" }, { reason: "missing", status: 404 }])
        .reason
    ).toBe("missing");
    expect(
      mostInformative([{ reason: "unreadable" }, { reason: "blocked" }]).reason
    ).toBe("blocked");
  });
});

describe("vetting the URL before the server fetches it", () => {
  it("refuses the private ranges and the metadata endpoint", () => {
    for (const host of [
      "http://localhost/x",
      "http://127.0.0.1/x",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "https://admin.internal/",
      "https://printer.local/",
      "https://intranet",
      "http://[fd00::1]/",
    ]) {
      expect(safePublicUrl(host), host).toBeNull();
    }
  });

  it("refuses credentials in the URL", () => {
    expect(safePublicUrl("https://user:pass@example.com/")).toBeNull();
  });

  it("does not mistake a real domain for a private IPv6 range", () => {
    // A bare "fc"/"fd" prefix check rejected fc-realty.com — a working
    // website — as a unique-local address.
    expect(safePublicUrl("https://fc-realty.com/about")).toBe(
      "https://fc-realty.com/about"
    );
    expect(safePublicUrl("https://fdhomes.com/")).toBe("https://fdhomes.com/");
  });

  it("accepts a bare domain by assuming https", () => {
    expect(safePublicUrl("janedoerealty.com")).toBe("https://janedoerealty.com/");
  });
});

describe("reading a page end to end", () => {
  it("authenticates reader requests when JINA_READER_API_KEY is configured", async () => {
    vi.stubEnv("JINA_READER_API_KEY", "reader-secret");
    fetchMock.mockResolvedValueOnce(
      new Response(`Title: Jane Doe\n\n${"Jane sells houses. ".repeat(40)}`, {
        status: 200,
      }),
    );

    await expect(readPublicPage(ZILLOW_PROFILE)).resolves.toMatch(/Jane Doe/);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://r.jina.ai/${ZILLOW_PROFILE}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer reader-secret",
        }),
      }),
    );
  });

  it("returns the text when the site answers plainly", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(BIO));
    const text = await readPublicPage(PROFILE);
    expect(text).toMatch(/Jane has helped families/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps Zillow's summary and tail contact details within the extraction budget", async () => {
    const summary = `Seamus Costigan Marr Caruso Realty Group 5.0 28 reviews ${"profile summary ".repeat(80)}`;
    const listings = "listing history card ".repeat(8_000);
    const contact = `${"footer context ".repeat(80)} Service areas (3) Norwalk, CT Stamford, CT Fairfield, CT Contact Seamus Costigan (203) 550-0531 sc.newbridge@gmail.com`;
    fetchMock.mockResolvedValueOnce(
      htmlResponse(`<html><body>${summary}${listings}${contact}</body></html>`)
    );

    const text = await readPublicPage(ZILLOW_PROFILE);

    expect(text).toMatch(/Marr Caruso Realty Group/);
    expect(text).toMatch(/Service areas \(3\)/);
    expect(text).toMatch(/sc\.newbridge@gmail\.com/);
    expect(text.length).toBeLessThanOrEqual(61_000);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://r.jina.ai/${ZILLOW_PROFILE}`
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Zillow's direct response when the rendered reader is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("reader unavailable", { status: 503 }))
      .mockResolvedValueOnce(htmlResponse(BIO));

    await expect(readPublicPage(ZILLOW_PROFILE)).resolves.toMatch(
      /Jane has helped families/
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://r.jina.ai/${ZILLOW_PROFILE}`
    );
    expect(fetchMock.mock.calls[1][0]).toBe(ZILLOW_PROFILE);
  });

  it("falls back to the reader service when the site returns 403", async () => {
    fetchMock
      .mockResolvedValueOnce(htmlResponse("Forbidden", 403))
      .mockResolvedValueOnce(
        new Response(`Title: Jane Doe\n\n${"Jane sells houses. ".repeat(40)}`, {
          status: 200,
        })
      );

    const text = await readPublicPage(PROFILE);
    expect(text).toMatch(/Jane sells houses/);
    // And it asked for the target correctly, which is the whole fix.
    expect(fetchMock.mock.calls[1][0]).toBe(`https://r.jina.ai/${PROFILE}`);
  });

  it("falls back when the page is a 200 with nothing on it", async () => {
    // The portal case: the profile exists, but the text arrives via
    // JavaScript that a server-side fetch never runs.
    fetchMock
      .mockResolvedValueOnce(htmlResponse("<div id='root'></div>"))
      .mockResolvedValueOnce(
        new Response("Jane Doe, REALTOR. ".repeat(40), { status: 200 })
      );

    await expect(readPublicPage(PROFILE)).resolves.toMatch(/Jane Doe/);
  });

  it("falls back when the direct fetch throws", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce(
        new Response("Jane Doe, REALTOR. ".repeat(40), { status: 200 })
      );

    await expect(readPublicPage(PROFILE)).resolves.toMatch(/Jane Doe/);
  });

  it("says the portal blocks us when both routes hit a wall", async () => {
    fetchMock
      .mockResolvedValueOnce(htmlResponse("Access Denied", 403))
      .mockResolvedValueOnce(
        new Response("Target URL returned error 403: Forbidden", { status: 200 })
      );

    const error = await readPublicPage(PROFILE).catch((e) => e);
    expect(error).toBeInstanceOf(PageReadError);
    expect(error.reason).toBe("blocked");
    expect(error.message).toMatch(/Homes\.com blocks automated reading/);
    expect(error.message).toMatch(/fill your Blueprint in by hand/);
  });

  it("reads the target's real status out of the reader's own 200", async () => {
    // r.jina.ai answers 200 and reports the target's failure in the body.
    // Treating that as success is how a wall reached the extraction model.
    fetchMock
      .mockResolvedValueOnce(htmlResponse("<div id='root'></div>"))
      .mockResolvedValueOnce(
        new Response("Target URL returned error 404: Not Found", { status: 200 })
      );

    const error = await readPublicPage(PROFILE).catch((e) => e);
    expect(error.reason).toBe("missing");
    expect(error.message).toMatch(/no longer exists/i);
  });

  it("does not spend a second request confirming a dead link", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse("Not Found", 404));

    const error = await readPublicPage(PROFILE).catch((e) => e);
    expect(error.reason).toBe("missing");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect, and refuses one that points inside the network", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      })
    );
    fetchMock.mockResolvedValueOnce(
      new Response("Jane Doe, REALTOR. ".repeat(40), { status: 200 })
    );

    // The redirect is rejected, so the direct read fails and the reader is
    // asked instead — the metadata endpoint is never fetched.
    await readPublicPage(PROFILE).catch(() => undefined);
    expect(fetchMock.mock.calls[1][0]).toBe(`https://r.jina.ai/${PROFILE}`);
  });

  it("calls a non-page a file rather than an unreadable website", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("%PDF-1.4", {
          status: 200,
          headers: { "content-type": "application/pdf" },
        })
      )
      .mockResolvedValueOnce(new Response("", { status: 422 }));

    const error = await readPublicPage(PROFILE).catch((e) => e);
    expect(error.reason).toBe("not-a-page");
  });
});

describe("when Firecrawl is configured", () => {
  beforeEach(() => {
    vi.mocked(firecrawlIsConfigured).mockReturnValue(true);
  });

  it("uses its markdown when it comes back readable", async () => {
    vi.mocked(scrapeUrl).mockResolvedValueOnce({
      markdown: `# Jane Doe\n\n${"Jane sells houses. ".repeat(40)}`,
      title: "Jane Doe",
      sourceUrl: PROFILE,
    });

    await expect(readPublicPage(PROFILE)).resolves.toMatch(/Jane sells houses/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries on to the other routes when Firecrawl fails", async () => {
    // Its 401s and 402s are our billing state, not the operator's website.
    // Previously a Firecrawl failure ended the import outright.
    vi.mocked(scrapeUrl).mockRejectedValueOnce(
      new Error("Firecrawl returned 402: insufficient credits")
    );
    fetchMock.mockResolvedValueOnce(htmlResponse(BIO));

    await expect(readPublicPage(PROFILE)).resolves.toMatch(/Jane has helped/);
  });

  it("never surfaces Firecrawl's own error text to the operator", async () => {
    vi.mocked(scrapeUrl).mockRejectedValueOnce(
      new Error("Firecrawl returned 401: FIRECRAWL_API_KEY is invalid")
    );
    fetchMock
      .mockResolvedValueOnce(htmlResponse("Access Denied", 403))
      .mockResolvedValueOnce(new Response("", { status: 403 }));

    const error = await readPublicPage(PROFILE).catch((e) => e);
    expect(error.message).not.toMatch(/firecrawl|api.?key/i);
  });

  it("carries on when Firecrawl returns the wall as markdown", async () => {
    vi.mocked(scrapeUrl).mockResolvedValueOnce({
      markdown: "Just a moment...",
      title: null,
      sourceUrl: PROFILE,
    });
    fetchMock.mockResolvedValueOnce(htmlResponse(BIO));

    await expect(readPublicPage(PROFILE)).resolves.toMatch(/Jane has helped/);
  });
});

describe("staying inside the time the function is allowed to run", () => {
  // The regression that replaced one bad message with a worse one: three
  // attempts each under their own timeout still added past the platform's
  // function limit, the gateway killed the invocation, and an empty body
  // reached the browser as "Unexpected end of JSON input".

  it("does not start an attempt it has no budget for", async () => {
    fetchMock.mockImplementation(
      () => new Promise(() => {}) // never settles
    );

    const started = Date.now();
    const error = await readPublicPage(PROFILE, 1_200).catch((e) => e);

    expect(error).toBeInstanceOf(PageReadError);
    expect(error.reason).toBe("too-slow");
    // Well inside the budget, because it declined to start a doomed attempt.
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("tells the operator the portal was too slow, and where to go instead", () => {
    const message = readFailureMessage("too-slow", PROFILE);
    expect(message).toMatch(/did not answer in time/i);
    expect(message).toMatch(/brokerage or personal website/i);
    expect(message).toMatch(/fill your Blueprint in by hand/i);
  });

  it("prefers a real diagnosis over a timeout when it has both", () => {
    expect(
      mostInformative([{ reason: "too-slow" }, { reason: "blocked" }]).reason
    ).toBe("blocked");
    expect(
      mostInformative([{ reason: "too-slow" }, { reason: "unreachable" }]).reason
    ).toBe("too-slow");
  });

  it("abandons a Firecrawl scrape that overruns the budget", async () => {
    vi.mocked(firecrawlIsConfigured).mockReturnValue(true);
    vi.mocked(scrapeUrl).mockImplementation(() => new Promise(() => {}));
    fetchMock.mockResolvedValueOnce(htmlResponse(BIO));

    // Firecrawl never answers; the direct read still gets its turn.
    await expect(readPublicPage(PROFILE, 6_000)).resolves.toMatch(
      /Jane has helped/
    );
  });
});
