import { describe, expect, it } from "vitest";
import {
  LEGAL_ENTITY,
  REQUIRED_LEGAL_FIELDS,
  isLegalConfigComplete,
  legalConfigGaps,
  type LegalEntityConfig,
} from "./legal";

/**
 * These four values are legally load-bearing: the entity that is party to the
 * agreement, the address legal notice is sent to, the law and venue governing
 * a dispute, and the date the terms took effect. A policy that names the wrong
 * entity or cites no venue can be unenforceable, and an invented address
 * misdirects service of process.
 *
 * So the failure mode guarded here is a *silent* one — a blank that reads as
 * finished prose. Every unset field has to surface as a gap.
 */

const blank: LegalEntityConfig = {
  legalName: "",
  mailingAddress: "",
  governingState: "",
  governingVenue: "",
  effectiveDate: "",
  contactEmail: "hello@agentstackcrm.app",
};

describe("legal configuration gaps", () => {
  it("reports every required field when nothing is set", () => {
    expect(legalConfigGaps(blank).map((g) => g.key)).toEqual([
      "legalName",
      "mailingAddress",
      "governingState",
      "governingVenue",
      "effectiveDate",
    ]);
    expect(isLegalConfigComplete(blank)).toBe(false);
  });

  it("treats whitespace as unset, not as a value", () => {
    // "   " renders as an invisible blank in the document — the exact failure
    // this guards against.
    const spaces = { ...blank, legalName: "   " };
    expect(legalConfigGaps(spaces).some((g) => g.key === "legalName")).toBe(
      true
    );
  });

  it("clears a field once it is set", () => {
    const partial = { ...blank, legalName: "AgentStack" };
    expect(legalConfigGaps(partial).map((g) => g.key)).not.toContain(
      "legalName"
    );
    expect(legalConfigGaps(partial)).toHaveLength(4);
  });

  it("is complete only when all five are present", () => {
    const full: LegalEntityConfig = {
      legalName: "AgentStack",
      mailingAddress: "184 High Ridge Road, Stamford, CT 06905",
      governingState: "Connecticut",
      governingVenue: "Fairfield County, Connecticut",
      effectiveDate: "August 16, 2026",
      contactEmail: "hello@agentstackcrm.app",
    };
    expect(isLegalConfigComplete(full)).toBe(true);
    expect(legalConfigGaps(full)).toEqual([]);
  });

  it("gives each field an env var and a worked example", () => {
    // The banner tells an operator exactly how to fix a gap; a label alone
    // would leave them hunting for the variable name.
    for (const field of REQUIRED_LEGAL_FIELDS) {
      expect(field.envVar).toMatch(/^NEXT_PUBLIC_LEGAL_/);
      expect(field.label.length).toBeGreaterThan(3);
      expect(field.example.length).toBeGreaterThan(3);
    }
  });

  it("ships with the operator's details configured", () => {
    // Guards against a future refactor dropping the defaults and silently
    // publishing documents that name no company.
    expect(isLegalConfigComplete(LEGAL_ENTITY)).toBe(true);
    expect(LEGAL_ENTITY.contactEmail).toBe("hello@agentstackcrm.app");
  });
});
