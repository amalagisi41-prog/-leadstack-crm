import { describe, it, expect } from "vitest";
import {
  checkFairHousing,
  compileGuardedSend,
  INBOUND_INITIATED_TRIGGER_TYPES,
  type GuardrailContext,
} from "./guardrails";

const DEFAULT_KEYWORDS = ["complaint", "refund", "stop ai", "speak to manager"];

function ctx(overrides: Partial<GuardrailContext> = {}): GuardrailContext {
  return {
    messageBody: "Hi, thanks for reaching out — happy to help!",
    sendWindow: null,
    isInboundTriggered: false,
    escalationKeywords: DEFAULT_KEYWORDS,
    lastInboundMessage: null,
    now: new Date("2026-07-14T15:00:00Z"), // 3pm UTC — inside any reasonable window
    ...overrides,
  };
}

describe("checkFairHousing", () => {
  it("blocks classic familial-status steering language", () => {
    expect(checkFairHousing("This is a great home, no kids allowed though.").blocked).toBe(
      true,
    );
    expect(checkFairHousing("Perfect for a family, empty nesters welcome.").blocked).toBe(
      true,
    );
  });

  it("blocks religion-based steering", () => {
    expect(
      checkFairHousing("Walking distance to church, great Christian community.").blocked,
    ).toBe(true);
  });

  it("blocks national-origin / race steering", () => {
    expect(checkFairHousing("English speakers only need apply.").blocked).toBe(true);
    expect(checkFairHousing("An exclusive neighborhood for the right buyer.").blocked).toBe(
      true,
    );
  });

  it("blocks disability-based steering", () => {
    expect(
      checkFairHousing("Must be able-bodied and climb stairs daily.").blocked,
    ).toBe(true);
  });

  it("blocks sex-based steering", () => {
    expect(checkFairHousing("Men only building, great location.").blocked).toBe(true);
  });

  it("is case-insensitive and catches steering language mid-sentence", () => {
    expect(checkFairHousing("NO KIDS, sorry — landlord's rule.").blocked).toBe(true);
  });

  it("does not flag ordinary, compliant real-estate copy", () => {
    const clean = [
      "Thanks for your interest! This 3BR/2BA is priced at $450,000.",
      "Would you like to schedule a showing this weekend?",
      "Great school district and close to downtown shops.",
      "Let me know your budget and I'll pull some comps for you.",
    ];
    for (const text of clean) {
      expect(checkFairHousing(text).blocked).toBe(false);
    }
  });
});

describe("compileGuardedSend — Fair Housing", () => {
  it("blocks a send containing steering language regardless of timing", () => {
    const result = compileGuardedSend(
      ctx({ messageBody: "This home is perfect for a family, no kids next door either." }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("fair_housing");
  });
});

describe("compileGuardedSend — escalation keywords", () => {
  it("blocks when the lead's own message hits an escalation keyword", () => {
    const result = compileGuardedSend(
      ctx({ lastInboundMessage: "I want a refund, this is unacceptable." }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed && result.reason === "escalation") {
      expect(result.matchedKeyword).toBe("refund");
    } else {
      throw new Error("expected an escalation block");
    }
  });

  it("blocks a 'speak to manager' escalation regardless of case", () => {
    const result = compileGuardedSend(
      ctx({ lastInboundMessage: "Let me SPEAK TO MANAGER right now." }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("escalation");
  });

  it("allows a clean send with no inbound message to check", () => {
    const result = compileGuardedSend(ctx({ lastInboundMessage: null }));
    expect(result.allowed).toBe(true);
  });
});

describe("compileGuardedSend — quiet hours", () => {
  const NIGHT = new Date("2026-07-14T04:00:00Z"); // 4am UTC
  const WINDOW = { startHour: 9, endHour: 18, timezone: "UTC" };

  it("blocks an outbound-initiated send outside the configured window", () => {
    const result = compileGuardedSend(
      ctx({ sendWindow: WINDOW, isInboundTriggered: false, now: NIGHT }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed && result.reason === "quiet_hours") {
      expect(result.deferSeconds).toBeGreaterThan(0);
    } else {
      throw new Error("expected a quiet_hours block");
    }
  });

  it("allows an inbound-triggered first reply even outside the window", () => {
    const result = compileGuardedSend(
      ctx({ sendWindow: WINDOW, isInboundTriggered: true, now: NIGHT }),
    );
    expect(result.allowed).toBe(true);
  });

  it("allows any send inside the window regardless of inbound/outbound", () => {
    const day = new Date("2026-07-14T12:00:00Z"); // noon UTC, inside window
    expect(
      compileGuardedSend(ctx({ sendWindow: WINDOW, isInboundTriggered: false, now: day }))
        .allowed,
    ).toBe(true);
    expect(
      compileGuardedSend(ctx({ sendWindow: WINDOW, isInboundTriggered: true, now: day }))
        .allowed,
    ).toBe(true);
  });

  it("allows sends with no configured window (fail open)", () => {
    expect(compileGuardedSend(ctx({ sendWindow: null, now: NIGHT })).allowed).toBe(true);
  });
});

describe("compileGuardedSend — check ordering", () => {
  it("Fair Housing content is blocked even on an inbound-triggered, in-window send", () => {
    const result = compileGuardedSend(
      ctx({
        messageBody: "No kids in this building, sorry!",
        isInboundTriggered: true,
        now: new Date("2026-07-14T12:00:00Z"),
      }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("fair_housing");
  });

  it("escalation is checked before quiet hours — an after-hours escalated lead still reports escalation, not quiet_hours", () => {
    const result = compileGuardedSend(
      ctx({
        sendWindow: { startHour: 9, endHour: 18, timezone: "UTC" },
        isInboundTriggered: false,
        now: new Date("2026-07-14T04:00:00Z"),
        lastInboundMessage: "This is a complaint about your service.",
      }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("escalation");
  });
});

describe("INBOUND_INITIATED_TRIGGER_TYPES", () => {
  it("covers the trigger types a lead can reach out through first", () => {
    expect(INBOUND_INITIATED_TRIGGER_TYPES.has("form.submitted")).toBe(true);
    expect(INBOUND_INITIATED_TRIGGER_TYPES.has("contact.created")).toBe(true);
    expect(INBOUND_INITIATED_TRIGGER_TYPES.has("contact.missed_call")).toBe(true);
  });

  it("does not cover operator/time-based triggers", () => {
    expect(INBOUND_INITIATED_TRIGGER_TYPES.has("contact.stale")).toBe(false);
    expect(INBOUND_INITIATED_TRIGGER_TYPES.has("pipeline.stage.changed")).toBe(false);
    expect(INBOUND_INITIATED_TRIGGER_TYPES.has("deal.completed")).toBe(false);
  });
});
