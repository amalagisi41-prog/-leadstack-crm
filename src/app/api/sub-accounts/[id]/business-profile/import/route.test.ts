import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-tenancy", () => ({
  requireSubAccountAdmin: vi.fn(async () => ({
    uid: "operator-1",
    agencyId: "agency-1",
  })),
}));

const setMock = vi.fn(async () => undefined);
let savedProfile: Record<string, unknown> | null = null;
const getMock = vi.fn(async () => ({
  exists: savedProfile !== null,
  data: () => savedProfile,
}));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    doc: () => ({
      get: getMock,
      set: setMock,
    }),
  }),
}));

vi.mock("@/lib/comms/ai/openrouter", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/comms/ai/openrouter")
  >("@/lib/comms/ai/openrouter");
  return {
    ...actual,
    aiIsConfigured: vi.fn(() => true),
    callAi: vi.fn(async () => ({
      text: '{"agentName":"Jane Doe"}',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: "test",
    })),
  };
});

vi.mock("@/lib/business-profile/read-public-page", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/business-profile/read-public-page")
  >("@/lib/business-profile/read-public-page");
  return { ...actual, readPublicPageContent: vi.fn() };
});

import { POST } from "./route";
import { AiError, callAi } from "@/lib/comms/ai/openrouter";
import {
  PageReadError,
  readPublicPageContent,
  type PageContent,
} from "@/lib/business-profile/read-public-page";

/** Wrap plain text the way the reader now delivers it. */
function pageOf(text: string, kind: PageContent["kind"] = "markdown"): PageContent {
  return { text, raw: text, kind };
}

/**
 * The regression: the catch here replaced every diagnosed failure with
 * "Could not read that website." — so the reader could work out exactly what
 * was wrong and the operator would still be told nothing, on the first screen
 * of the product.
 */

const ctx = { params: Promise.resolve({ id: "sub-1" }) };

function makeRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/sub-accounts/sub-1/business-profile/import",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readPublicPageContent).mockReset();
  vi.mocked(callAi).mockReset();
  savedProfile = null;
  vi.mocked(callAi).mockResolvedValue({
    text: "agentName=Jane Doe",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: "test",
  });
});

describe("POST business-profile/import", () => {
  it("passes the diagnosed reason and next step straight through", async () => {
    vi.mocked(readPublicPageContent).mockRejectedValueOnce(
      new PageReadError(
        "Homes.com blocks automated reading, so we could not pull your details from that page. Paste your brokerage or personal website instead — an About or agent-bio page works best — or fill your Blueprint in by hand — every field here is editable.",
        "blocked"
      )
    );

    const res = await POST(
      makeRequest({ url: "https://www.homes.com/real-estate-agents/jane/x/" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/Homes\.com blocks automated reading/);
    expect(body.error).toMatch(/fill your Blueprint in by hand/);
    expect(body.error).not.toBe("Could not read that website.");
  });

  it("still says what to do when something unexpected breaks", async () => {
    vi.mocked(readPublicPageContent).mockRejectedValueOnce(new Error("boom"));

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/fill your Blueprint in by hand/);
    // And never leaks the internal message.
    expect(body.error).not.toMatch(/boom/);
  });

  it("answers in JSON when the extraction model fails", async () => {
    // callAi was unguarded, so an OpenRouter outage became an uncaught throw,
    // which Next.js turns into a 500 with an empty body — and an empty body
    // reaches the browser as "Unexpected end of JSON input".
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf("Jane Doe, REALTOR."));
    vi.mocked(callAi).mockRejectedValueOnce(
      new AiError("OpenRouter 429: slow down", { status: 429 })
    );

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toMatch(/we read your page/i);
    expect(body.error).toMatch(/by hand/i);
    expect(body.code).toBe("AI-BUSY");
    // Their page was fine — do not blame their link for our outage.
    expect(body.error).not.toMatch(/could not read|blocks automated/i);
    expect(body.error).not.toMatch(/openrouter|429/i);
  });

  it("parses the low-overhead line protocol and ignores unapproved keys", async () => {
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf("Jane Doe, REALTOR."));
    vi.mocked(callAi).mockResolvedValueOnce({
      text: [
        "agentName=Jane Doe",
        "brokerage=Example Realty",
        "phone=Not provided",
        "idealClientProfile=Not explicitly stated",
        "services=buyers,sellers,not_a_real_service",
        "commentary=this must be ignored",
      ].join("\n"),
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: "free/test",
    });

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.agentName).toBe("Jane Doe");
    expect(body.profile.brokerage).toBe("Example Realty");
    expect(body.profile.phone).toBe("");
    expect(body.profile.idealClientProfile).toBe("");
    expect(body.profile.services).toEqual(["buyers", "sellers"]);
    expect(body.profile.commentary).toBeUndefined();
    expect(callAi).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callAi).mock.calls[0][0].responseFormat).toBeUndefined();
  });

  it("retries malformed line output once as structured JSON", async () => {
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf("Jane Doe, REALTOR."));
    vi.mocked(callAi)
      .mockResolvedValueOnce({
        text: "I'm afraid I can't.",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model: "test",
      })
      .mockResolvedValueOnce({
        text: '{"agentName":"Jane Doe"}',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model: "test",
      });

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile.agentName).toBe("Jane Doe");
    expect(callAi).toHaveBeenCalledTimes(2);
    expect(vi.mocked(callAi).mock.calls[1][0].responseFormat).toEqual({
      type: "json_object",
    });
  });

  it("answers in JSON when both parser attempts are invalid", async () => {
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf("Jane Doe, REALTOR."));
    vi.mocked(callAi).mockResolvedValue({
      text: "I'm afraid I can't.",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: "test",
    });

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/another public website/i);
    expect(callAi).toHaveBeenCalledTimes(2);
  });

  it("answers in JSON when something unexpected throws", async () => {
    // The outer guard. Without it Next.js writes no body at all.
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf("Jane Doe, REALTOR."));
    getMock.mockRejectedValueOnce(new Error("Firestore unavailable"));

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text.length).toBeGreaterThan(0); // never an empty body
    expect(JSON.parse(text).error).toMatch(/Nothing was changed/i);
  });

  it("gives the model the time the read did not spend", async () => {
    // A flat 20s cap on a call that previously had no timeout is what broke
    // AI-assisted setup: a full Blueprint regularly takes longer than that.
    // The budget now adapts, and must stay inside maxDuration (60s).
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf("Jane Doe, REALTOR."));
    await POST(makeRequest({ url: "https://janedoerealty.com/about" }), ctx);

    const [args] = vi.mocked(callAi).mock.calls.at(-1)!;
    expect(args.timeoutMs).toBeGreaterThan(30_000);
    expect(args.timeoutMs).toBeLessThan(55_000);
  });

  it("still leaves the model a workable floor after a slow read", async () => {
    vi.mocked(readPublicPageContent).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return pageOf("Jane Doe, REALTOR.");
    });
    await POST(makeRequest({ url: "https://janedoerealty.com/about" }), ctx);

    const [args] = vi.mocked(callAi).mock.calls.at(-1)!;
    expect(args.timeoutMs).toBeGreaterThanOrEqual(15_000);
  });

  it("names the fault instead of calling everything 'not responding'", async () => {
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf("Jane Doe, REALTOR."));
    vi.mocked(callAi).mockRejectedValueOnce(
      new AiError("did not respond in time", { timedOut: true })
    );

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(body.code).toBe("AI-TIMEOUT");
    expect(body.error).toMatch(/took longer than we allow/i);
  });

  it("does not tell them to retry a misconfiguration", async () => {
    // A wrong key or a spent balance will not fix itself on the third attempt.
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf("Jane Doe, REALTOR."));
    vi.mocked(callAi).mockRejectedValueOnce(
      new AiError("nope", { status: 401 })
    );

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("AI-AUTH");
    expect(body.error).not.toMatch(/try again/i);
    expect(body.error).toMatch(/by hand/i);
  });

  it("keeps a page's own JSON-LD facts even when the model returns almost nothing", async () => {
    // The Crexi regression: the page declares the agent in schema.org
    // structure, the text cleanup strips it, and a weak model answer left the
    // import at 29%. Structure is the page's own declaration — it must win.
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(
      pageOf(
        `<html><head><script type="application/ld+json">
          {"@type":"Person","name":"Seamus Costigan",
           "worksFor":{"@type":"Organization","name":"Marr Caruso Realty Group"},
           "telephone":"(203) 550-0531","email":"sc.newbridge@gmail.com",
           "url":"https://newbridge-properties.com/"}
        </script></head><body>Profile</body></html>`,
        "html"
      )
    );
    vi.mocked(callAi).mockResolvedValueOnce({
      text: "agentName=Seamus Costigan",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: "test",
    });

    const res = await POST(
      makeRequest({ url: "https://www.crexi.com/profile/seamus-costigan" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.agentName).toBe("Seamus Costigan");
    expect(body.profile.brokerage).toBe("Marr Caruso Realty Group");
    expect(body.profile.phone).toBe("(203) 550-0531");
    expect(body.profile.email).toBe("sc.newbridge@gmail.com");
    expect(body.profile.website).toBe("https://newbridge-properties.com/");
    expect(body.extractionMode).toBe("source-reader");
    expect(callAi).not.toHaveBeenCalled();
  });

  it("hands the structured facts to the operator even when the AI is down", async () => {
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(
      pageOf(
        `<html><head><script type="application/ld+json">
          {"@type":"Person","name":"Seamus Costigan","telephone":"(203) 550-0531"}
        </script></head><body>Profile</body></html>`,
        "html"
      )
    );
    vi.mocked(callAi).mockRejectedValueOnce(new AiError("nope", { status: 402 }));

    const res = await POST(
      makeRequest({ url: "https://www.crexi.com/profile/seamus-costigan" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.agentName).toBe("Seamus Costigan");
    expect(body.profile.phone).toBe("(203) 550-0531");
  });

  it("keeps the first-party profile phone ahead of a referral footer phone", async () => {
    const source = `Marr & Caruso Realty Group (978) 622-2360 footer referral Seamus Costigan Licensed Real Estate Agent & Investor Marr & Caruso Realty Group License: CT-0804225 sc.newbridge@gmail.com (203) 550-0531 About Seamus ${"Serving Stamford and Fairfield County. ".repeat(8)}`;
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf(source));

    const res = await POST(
      makeRequest({ url: "https://www.artisanhomenetwork.com/agents/seamus" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toMatchObject({
      agentName: "Seamus Costigan",
      brokerage: "Marr & Caruso Realty Group",
      licenseNumber: "CT-0804225",
      licenseStates: "CT",
      phone: "(203) 550-0531",
    });
  });

  it("rejects a private address before any request goes out", async () => {
    const res = await POST(
      makeRequest({ url: "http://169.254.169.254/latest/meta-data/" }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(readPublicPageContent).not.toHaveBeenCalled();
  });

  it("returns a review draft without mutating the approved profile", async () => {
    savedProfile = {
      agentName: "Approved Agent",
      email: "approved@example.com",
      website: "https://approved.example.com",
    };
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf(
      "Jane Doe is a REALTOR in Fairfield County."
    ));

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profile.agentName).toBe("Jane Doe");
    expect(body.profile.email).toBe("approved@example.com");
    expect(body.profile.website).toBe("https://approved.example.com");
    expect(body.needsReview).toBe(true);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("returns an incomplete Zillow read for review without calling AI or saving", async () => {
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf("Jane Doe, REALTOR."));

    const source = "https://www.zillow.com/profile/jane-doe";
    const res = await POST(makeRequest({ url: source }), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.needsReview).toBe(true);
    expect(body.extractionMode).toBe("source-reader");
    expect(body.sourceCompleteness).toBeLessThan(100);
    expect(body.profile.agentName).toBe("jane doe");
    expect(body.missingLaunchFields).toEqual(
      expect.arrayContaining(["brokerage", "phoneOrEmail", "serviceAreas"]),
    );
    expect(callAi).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });

  it("builds a complete Zillow review draft without calling AI", async () => {
    const source = "https://www.zillow.com/profile/Seamus%20Costigan";
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf(`
      # Seamus Costigan
      Marr Caruso Realty Group 5.0 [28 reviews](#reviews)
      Real Estate Agent in Stamford, CT

      ## Get to know Seamus Costigan
      Real Estate Industry
      I’m a high performing and passionate real estate agent & Investor serving clients throughout Fairfield County and nearby areas. As a practically lifelong resident of Stamford, CT, originally from Ireland, I learned about real estate around our family-owned construction business of 30+ years.
      Specialties Buyer's Agent Listing Agent Commercial Properties Investment Properties New Construction
      20 Years of experience [Visit agent website](https://newbridge-properties.com/)

      14 Sales last 12 months 149 Total sales $239K-$1.9M Price range $740K Average price

      ## Service areas (3)
      [Norwalk, CT](/norwalk-ct/) [Stamford, CT](/stamford-ct/) [Fairfield, CT](/fairfield-ct/)
      ## Contact Seamus Costigan
      [(203) 550-0531](tel:2035500531)
      [sc.newbridge@gmail.com](mailto:sc.newbridge@gmail.com)
    `));
    vi.mocked(callAi).mockResolvedValueOnce({
      text: "agentName=Seamus Costigan",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: "test",
    });

    const res = await POST(makeRequest({ url: source }), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.extractionMode).toBe("source-reader");
    expect(body.completeness).toBe(100);
    expect(body.profile).toMatchObject({
      agentName: "Seamus Costigan",
      title: "Real Estate Agent",
      brokerage: "Marr Caruso Realty Group",
      phone: "(203) 550-0531",
      email: "sc.newbridge@gmail.com",
      website: "https://newbridge-properties.com/",
      serviceAreas: "Norwalk, CT, Stamford, CT, Fairfield, CT",
      priceRanges: "$239K-$1.9M",
      clientExperience: "20 years of real estate experience",
      specialties:
        "Buyer's Agent, Listing Agent, Commercial Properties, Investment Properties, New Construction",
      services: ["buyers", "sellers", "commercial", "investors"],
    });
    expect(body.profile.bio).toMatch(/high performing and passionate/i);
    expect(callAi).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });

  it("ignores Zillow title/navigation noise and reads encoded contact links", async () => {
    const source = "https://www.zillow.com/profile/Seamus%20Costigan";
    vi.mocked(readPublicPageContent).mockResolvedValueOnce(pageOf(`
      Title: Seamus Costigan - Real Estate Agent in Stamford, CT - Reviews | Zillow
      Report a problem Profile Summary. Overview: Sales Statistics & Listings.
      Report a problem Report a problem Seamus Costigan Marr Caruso Realty Group 5.0 28 reviews Recent Sales
      14 Sales last 12 months 149 Total sales $239K-$1.9M Price range $740K Average price
      Get to know Seamus Costigan Real Estate Industry
      I’m a high performing and passionate real estate agent & Investor serving clients all throughout Fairfield County and the nearby areas. As a practically lifelong resident of Stamford, CT, originally from Ireland, I learned about real estate around our family owned construction business of 30+ years.
      Specialties Buyer's Agent Listing Agent Commercial Properties Investment Properties New Construction
      20 Years of experience [Visit agent website](newbridge-properties.com/)
      Seamus Costigan Marr Caruso Realty Group 5.0 28 reviews 14 sales last 12 months
      [(203)%20550-0531](tel:(203)%20550-0531)
      [sc.newbridge@gmail.com](mailto:sc.newbridge@gmail.com)
      Service areas (3) [Norwalk, CT](/norwalk-ct/) [Stamford, CT](/stamford-ct/) [Fairfield, CT](/fairfield-ct/)
      Nearby cities Real Estate in Armonk
    `));

    const res = await POST(makeRequest({ url: source }), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.extractionMode).toBe("source-reader");
    expect(body.completeness).toBe(100);
    expect(body.profile).toMatchObject({
      agentName: "Seamus Costigan",
      brokerage: "Marr Caruso Realty Group",
      phone: "(203) 550-0531",
      email: "sc.newbridge@gmail.com",
      website: "https://newbridge-properties.com/",
      serviceAreas: "Norwalk, CT, Stamford, CT, Fairfield, CT",
    });
    expect(body.profile.brokerage).not.toMatch(/report a problem/i);
    expect(callAi).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });
});
