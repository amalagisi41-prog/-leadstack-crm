import { describe, expect, it } from "vitest";
import { addOnKeyForGateField, isUnbilled } from "./add-on-sync";
import { ADD_ON_GATE_FIELD, ADD_ON_KEYS } from "./addon-catalog";
import type { AddOnSyncResult } from "./add-on-sync";

/**
 * The mapping from gate field to paid add-on is what makes the two toggle
 * screens agree. If a gate is billable but this returns null for its field,
 * the feature turns on and nobody is charged — which is the bug these tests
 * exist to keep fixed.
 */

describe("addOnKeyForGateField", () => {
  it("maps every paid add-on's gate field back to its key", () => {
    // Derived from the catalog rather than hardcoded, so adding an add-on
    // without wiring its field is caught here instead of in production.
    for (const key of ADD_ON_KEYS) {
      expect(addOnKeyForGateField(ADD_ON_GATE_FIELD[key])).toBe(key);
    }
  });

  it("maps the IDX gate specifically", () => {
    expect(addOnKeyForGateField("idxEnabledByAgency")).toBe("idx");
  });

  it("returns null for gates that cost nothing", () => {
    // These flip freely and must never touch Stripe.
    for (const field of [
      "apiAccessEnabledByAgency",
      "broadcastsEnabledByAgency",
      "whatsappEnabledByAgency",
      "metaInboxEnabledByAgency",
      "communityEnabledByAgency",
      "outboundVoiceEnabledByAgency",
      "emailDomainEnabledByAgency",
    ]) {
      expect(addOnKeyForGateField(field)).toBe(null);
    }
  });

  it("does not confuse the website gate with the paid Website Studio gate", () => {
    // `websiteEnabledByAgency` and `websiteStudioEnabledByAgency` differ by
    // one word and only the second is billable.
    expect(addOnKeyForGateField("websiteStudioEnabledByAgency")).toBe(
      "website_studio"
    );
    expect(addOnKeyForGateField("websiteEnabledByAgency")).toBe(null);
  });

  it("returns null for an unknown field rather than guessing", () => {
    expect(addOnKeyForGateField("")).toBe(null);
    expect(addOnKeyForGateField("somethingElse")).toBe(null);
  });
});

const result = (over: Partial<AddOnSyncResult>): AddOnSyncResult => ({
  addOnKey: "idx",
  gateField: "idxEnabledByAgency",
  enabled: true,
  outcome: "added",
  ...over,
});

describe("isUnbilled", () => {
  it("flags a feature switched on with no subscription to charge", () => {
    expect(isUnbilled(result({ outcome: "no_subscription" }))).toBe(true);
  });

  it("flags a feature switched on with no price configured", () => {
    expect(isUnbilled(result({ outcome: "not_priced" }))).toBe(true);
  });

  it("does not flag a feature that was actually billed", () => {
    expect(isUnbilled(result({ outcome: "added" }))).toBe(false);
    expect(isUnbilled(result({ outcome: "already" }))).toBe(false);
  });

  it("does not flag anything being switched off", () => {
    // Turning a feature off without a subscription is not a billing gap —
    // there was nothing to charge in the first place.
    for (const outcome of [
      "no_subscription",
      "not_priced",
      "removed",
      "already",
    ] as const) {
      expect(isUnbilled(result({ enabled: false, outcome }))).toBe(false);
    }
  });
});
