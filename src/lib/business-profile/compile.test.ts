import { describe, expect, it } from "vitest";
import {
  compileBusinessProfilePrompt,
  businessProfileCompleteness,
} from "./compile";
import {
  EMPTY_BUSINESS_PROFILE,
  type BusinessProfileContent,
} from "@/types/business-profile";

function make(over: Partial<BusinessProfileContent>): BusinessProfileContent {
  return { ...EMPTY_BUSINESS_PROFILE, ...over };
}

describe("compileBusinessProfilePrompt", () => {
  it("returns null for an untouched profile (defaults alone don't count)", () => {
    // EMPTY defaults compliance booleans on + an opt-out line + a brand
    // voice — none of which the operator actually typed. An untouched
    // profile must NOT inject a near-empty block into every AI turn.
    expect(compileBusinessProfilePrompt(EMPTY_BUSINESS_PROFILE)).toBeNull();
  });

  it("includes identity + market fields when present", () => {
    const out = compileBusinessProfilePrompt(
      make({
        agentName: "Jane Agent",
        brokerage: "KW Metro",
        serviceAreas: "Maplewood, Millburn",
        services: ["buyers", "first_time_buyers"],
      }),
    );
    expect(out).toContain("AGENT BUSINESS PROFILE");
    expect(out).toContain("Jane Agent");
    expect(out).toContain("KW Metro");
    expect(out).toContain("Maplewood, Millburn");
    // Service ids map to human labels.
    expect(out).toContain("Buyers");
    expect(out).toContain("First-time buyers");
  });

  it("emits compliance guardrails when toggled on", () => {
    const out = compileBusinessProfilePrompt(
      make({ agentName: "X", fairHousing: true, noLegalTaxAdvice: true }),
    );
    expect(out).toContain("Fair Housing");
    expect(out).toContain("legal, tax, or financial advice");
  });

  it("omits blank fields entirely (no empty labels)", () => {
    const out = compileBusinessProfilePrompt(make({ agentName: "X" }))!;
    expect(out).not.toContain("Brokerage:");
    expect(out).not.toContain("Website:");
  });

  it("includes only complete FAQ pairs", () => {
    const out = compileBusinessProfilePrompt(
      make({
        agentName: "X",
        faqs: [
          { q: "Free valuation?", a: "Yes, always free." },
          { q: "Incomplete", a: "" },
        ],
      }),
    )!;
    expect(out).toContain("Free valuation?");
    expect(out).toContain("Yes, always free.");
    expect(out).not.toContain("Incomplete");
  });

  it("includes buyer/seller process, objections, and documents", () => {
    const out = compileBusinessProfilePrompt(
      make({
        agentName: "X",
        buyerProcess: "We start with a quick call.",
        sellerProcess: "We start with a free valuation.",
        listingCopyStyle: "Warm and specific.",
        objections: [
          { objection: "Waiting for rates to drop", response: "Here's what waiting costs." },
          { objection: "Incomplete", response: "" },
        ],
        documents: [
          { label: "Pre-listing checklist", url: "https://x.com/checklist.pdf" },
          { label: "Incomplete", url: "" },
        ],
      }),
    )!;
    expect(out).toContain("We start with a quick call.");
    expect(out).toContain("We start with a free valuation.");
    expect(out).toContain("Warm and specific.");
    expect(out).toContain("Waiting for rates to drop");
    expect(out).toContain("Here's what waiting costs.");
    expect(out).toContain("Pre-listing checklist");
    expect(out).toContain("https://x.com/checklist.pdf");
    expect(out).not.toContain("Incomplete");
  });

  it("never includes scripts — dashboard-only, not sent to the AI", () => {
    const out = compileBusinessProfilePrompt(
      make({
        agentName: "X",
        scripts: "Cold-call opener: Hi, this is Jane...",
      }),
    )!;
    expect(out).not.toContain("Cold-call opener");
    expect(out).not.toContain("Hi, this is Jane");
  });

  it("includes brand DNA, ordered right after identity and before market", () => {
    const out = compileBusinessProfilePrompt(
      make({
        agentName: "X",
        clientExperience: "Calm and confident.",
        idealClientProfile: "First-time buyers in Fairfield County.",
        clientPromise: "Same-day response, always.",
        serviceAreas: "Maplewood",
      }),
    )!;
    expect(out).toContain("Calm and confident.");
    expect(out).toContain("First-time buyers in Fairfield County.");
    expect(out).toContain("Same-day response, always.");
    expect(out.indexOf("Agent: X")).toBeLessThan(out.indexOf("Calm and confident."));
    expect(out.indexOf("Calm and confident.")).toBeLessThan(
      out.indexOf("Service areas: Maplewood"),
    );
  });
});

describe("businessProfileCompleteness", () => {
  it("scores 0 for an empty profile", () => {
    expect(businessProfileCompleteness(EMPTY_BUSINESS_PROFILE)).toBe(0);
  });

  it("scores 100 when all weighted fields are filled", () => {
    const full = make({
      agentName: "Jane",
      brokerage: "KW",
      licenseStates: "NJ",
      email: "j@x.com",
      serviceAreas: "Maplewood",
      services: ["buyers"],
      businessHours: "9-5",
      qualificationRules: "budget + timeline",
      bio: "11 years",
      faqs: [{ q: "Q", a: "A" }],
      buyerProcess: "We start with a quick call.",
      objections: [{ objection: "Q", response: "A" }],
      clientPromise: "Same-day response, always.",
    });
    expect(businessProfileCompleteness(full)).toBe(100);
  });

  it("counts phone OR email for the contact check", () => {
    const withPhone = make({ phone: "555" });
    const withEmail = make({ email: "a@b.com" });
    expect(businessProfileCompleteness(withPhone)).toBe(
      businessProfileCompleteness(withEmail),
    );
  });
});
