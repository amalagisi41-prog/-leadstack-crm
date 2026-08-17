import { describe, expect, it } from "vitest";
import {
  EBR_DECLARATION_STATEMENT,
  IMPORT_DEFAULT_BASIS,
  canSendOn,
  requiredDisclosures,
  summariseSegment,
  type ConsentBasis,
  type ConsentState,
} from "./contact-consent";

/**
 * The most expensive mistake available in this product.
 *
 * A new operator imports years of accumulated contacts and sends an SMS blast
 * on day one. TCPA damages are $500–$1,500 per message per recipient and carry
 * a private right of action, so two thousand contacts is a seven-figure
 * exposure — carried by the agent, whose licence and business it is.
 *
 * These tests hold the line that the strictest reading is always the default,
 * and that email stays usable so the operator has a lawful way to reach the
 * list they legitimately own.
 */

const state = (
  basis: ConsentBasis,
  over: Partial<ConsentState> = {}
): ConsentState => ({
  basis,
  emailOptedOut: false,
  smsOptedOut: false,
  ...over,
});

describe("an opt-out beats everything", () => {
  it("blocks email to someone who unsubscribed, whatever the basis", () => {
    for (const basis of [
      "express_written",
      "existing_business_relationship",
      "manual_entry",
      "imported_unknown",
    ] as const) {
      const verdict = canSendOn("email", state(basis, { emailOptedOut: true }));
      expect(verdict.allowed, basis).toBe(false);
      expect(verdict.remedy, basis).toMatch(/opt back in themselves/i);
    }
  });

  it("blocks every message channel after a STOP", () => {
    for (const channel of ["sms", "voice", "whatsapp"] as const) {
      const verdict = canSendOn(
        channel,
        state("express_written", { smsOptedOut: true })
      );
      expect(verdict.allowed, channel).toBe(false);
      expect(verdict.remedy, channel).toMatch(/nothing here can override it/i);
    }
  });
});

describe("texting an imported list", () => {
  it("is blocked, because nobody agreed to it", () => {
    const verdict = canSendOn("sms", state("imported_unknown"));
    expect(verdict.allowed).toBe(false);
  });

  it("tells the operator what it would actually cost them", () => {
    // Vague warnings get clicked through. A number does not.
    const verdict = canSendOn("sms", state("imported_unknown"));
    expect(verdict.reason).toMatch(/\$500 to \$1,500 per message/);
    expect(verdict.reason).toMatch(/lands on you/i);
  });

  it("gives them a lawful way to reach the same people", () => {
    // Blocking without a route is the dead end this product does not permit —
    // and here it would push the operator to send from somewhere else.
    const verdict = canSendOn("sms", state("imported_unknown"));
    expect(verdict.remedy).toMatch(/email them first/i);
    expect(verdict.remedy).toMatch(/consent box/i);
  });

  it("still allows email to that list", () => {
    // CAN-SPAM needs honesty and a working unsubscribe, not prior opt-in.
    expect(canSendOn("email", state("imported_unknown")).allowed).toBe(true);
  });
});

describe("a past-client relationship", () => {
  it("covers email", () => {
    expect(
      canSendOn("email", state("existing_business_relationship")).allowed
    ).toBe(true);
  });

  it("does not extend to texting", () => {
    // The distinction operators get wrong most often: "they're my clients" is
    // a CAN-SPAM answer, not a TCPA one.
    const verdict = canSendOn("sms", state("existing_business_relationship"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/covers email/i);
    expect(verdict.reason).toMatch(/explicit written agreement/i);
  });
});

describe("express written consent", () => {
  it("unlocks every channel", () => {
    for (const channel of ["sms", "email", "voice", "whatsapp"] as const) {
      expect(canSendOn(channel, state("express_written")).allowed, channel).toBe(
        true
      );
    }
  });
});

describe("a hand-typed contact", () => {
  it("cannot be texted, because typing a number is not consent", () => {
    const verdict = canSendOn("sms", state("manual_entry"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.remedy).toMatch(/email them or call them|send them an email/i);
  });
});

describe("what an import assumes", () => {
  it("assumes nothing", () => {
    // The importer must never upgrade the basis on the operator's behalf.
    expect(IMPORT_DEFAULT_BASIS).toBe("imported_unknown");
  });

  it("makes the past-client claim the operator's own statement", () => {
    expect(EBR_DECLARATION_STATEMENT).toMatch(/I confirm/);
    expect(EBR_DECLARATION_STATEMENT).toMatch(/record of that relationship/i);
    // And it must not let them think it unlocks texting.
    expect(EBR_DECLARATION_STATEMENT).toMatch(
      /texting them still requires their separate written agreement/i
    );
  });
});

describe("what has to appear in the message", () => {
  it("puts the opt-out instruction in an SMS body", () => {
    const items = requiredDisclosures("sms", "Reply STOP to opt out.");
    expect(items).toContain("Reply STOP to opt out.");
    expect(items.join(" ")).toMatch(/sender identification/i);
  });

  it("falls back to standard wording when the profile has none", () => {
    expect(requiredDisclosures("sms", "   ")).toContain("Reply STOP to opt out.");
  });

  it("requires a postal address on email, which operators forget", () => {
    const items = requiredDisclosures("email", "");
    expect(items.join(" ")).toMatch(/physical postal address/i);
    expect(items.join(" ")).toMatch(/unsubscribe/i);
  });

  it("requires identification on a call", () => {
    expect(requiredDisclosures("voice", "").join(" ")).toMatch(
      /identify yourself and your brokerage/i
    );
  });
});

describe("summarising a whole segment", () => {
  const mixed: ConsentState[] = [
    state("express_written"),
    state("express_written"),
    state("imported_unknown"),
    state("existing_business_relationship"),
    state("express_written", { smsOptedOut: true }),
  ];

  it("splits the audience rather than refusing the campaign", () => {
    // A list is rarely uniform. Blocking everything because some contacts
    // cannot be texted is as unhelpful as sending to all of them.
    const summary = summariseSegment("sms", mixed);
    expect(summary.sendable).toBe(2);
    expect(summary.blocked).toBe(3);
    expect(summary.reasons.length).toBeGreaterThan(1);
  });

  it("counts email far more permissively than SMS", () => {
    const email = summariseSegment("email", mixed);
    expect(email.sendable).toBe(5);
    expect(email.blocked).toBe(0);
  });

  it("flags an audience that is entirely unreachable", () => {
    // Worth stopping before they spend an hour writing the campaign.
    const summary = summariseSegment("sms", [
      state("imported_unknown"),
      state("imported_unknown"),
    ]);
    expect(summary.emptyAudience).toBe(true);
    expect(summary.sendable).toBe(0);
  });

  it("does not call an empty list an unreachable audience", () => {
    expect(summariseSegment("sms", []).emptyAudience).toBe(false);
  });
});
