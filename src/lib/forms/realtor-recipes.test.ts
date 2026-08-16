import { describe, expect, it } from "vitest";
import { realtorFormRecipes } from "./realtor-recipes";

describe("realtor form recipes", () => {
  it("provides every standardized real-estate workflow", () => {
    expect(realtorFormRecipes().map((recipe) => recipe.id)).toEqual([
      "buyer",
      "seller",
      "renter",
      "investor",
      "valuation",
      "showing",
      "open_house",
      "recruiting",
      "referral",
    ]);
  });

  it("includes audited SMS consent wherever phone is collected", () => {
    for (const recipe of realtorFormRecipes("Avery Realty")) {
      expect(recipe.fields.some((field) => field.type === "sms_consent")).toBe(
        true
      );
      expect(
        recipe.fields.find((field) => field.type === "sms_consent")?.consentText
      ).toContain("STOP");
    }
  });
});
