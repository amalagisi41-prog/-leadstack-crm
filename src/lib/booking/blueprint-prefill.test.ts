import { describe, expect, it } from "vitest";
import { prefillBookingFromBlueprint, parseBusinessHours } from "./blueprint-prefill";
import { defaultBookingPageFormData } from "./defaults";

const profile = {
  agentName: "Seamus Costigan",
  clientPromise: "Same-day guidance with zero surprises.",
  bio: "A local real estate professional.",
  businessHours: "Mon–Fri 9–6, Sat by appointment",
  logoUrl: "https://example.com/logo.png",
} as never;

describe("booking Blueprint prefill", () => {
  it("fills a new draft from approved facts and standard hours", () => {
    const form = prefillBookingFromBlueprint(
      defaultBookingPageFormData("", "America/New_York"),
      profile,
    );
    expect(form.name).toBe("30-minute consultation with Seamus Costigan");
    expect(form.description).toContain("Same-day guidance");
    expect(form.logoUrl).toBe("https://example.com/logo.png");
    expect(form.workingHours).toHaveLength(5);
    expect(form.workingHours[0]).toMatchObject({ startMinute: 540, endMinute: 1080 });
  });

  it("does not overwrite operator edits", () => {
    const original = defaultBookingPageFormData("custom", "UTC");
    original.name = "Listing strategy call";
    original.description = "My custom description";
    const result = prefillBookingFromBlueprint(original, profile);
    expect(result.name).toBe("Listing strategy call");
    expect(result.description).toBe("My custom description");
  });

  it("rejects unsupported hours instead of guessing", () => {
    expect(parseBusinessHours("Call anytime")).toEqual([]);
  });
});
