import { describe, expect, it } from "vitest";
import {
  connectItemsFor,
  connectedCount,
  needsSetupItems,
  oneClickItems,
} from "./connect-tiers";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * The screen these feed replaced three identical dead cards that offered
 * Outlook (unsupported), a Google Business Profile page that is a
 * coming-soon placeholder, and texting as though it were a two-minute job —
 * while omitting Facebook/Instagram, the only genuine one-click connection.
 *
 * These tests hold the properties that keep it honest: real status, honest
 * tiering, and nothing offered that the product cannot actually do.
 */

function sub(overrides: Partial<SubAccountDoc> = {}): SubAccountDoc {
  return overrides as SubAccountDoc;
}

describe("what first-run setup offers to connect", () => {
  it("offers Facebook/Instagram, which the old screen left out entirely", () => {
    const social = connectItemsFor(sub()).find((i) => i.id === "social");
    expect(social).toBeDefined();
    expect(social?.tier).toBe("one_click");
  });

  it("never offers Google Business Profile", () => {
    // Its channel is a hidden coming-soon placeholder and its API needs a
    // separate manual approval from Google. Offering it would be a button
    // that cannot work — the same reason deferral.ts marks LinkedIn
    // unavailable rather than showing a connect link.
    const ids = connectItemsFor(sub()).map((i) => i.id);
    expect(ids).not.toContain("google_business");
  });

  it("gives every item a plain-language reason and a skip cost", () => {
    for (const item of connectItemsFor(sub())) {
      expect(item.why.trim().length, item.id).toBeGreaterThan(0);
      expect(item.costIfSkipped.trim().length, item.id).toBeGreaterThan(0);
      expect(item.cta.trim().length, item.id).toBeGreaterThan(0);
    }
  });

  it("warns that texting takes weeks and is out of the agent's hands", () => {
    const texting = connectItemsFor(sub()).find((i) => i.id === "texting");
    expect(texting?.tier).toBe("needs_setup");
    expect(texting?.timingNote ?? "").toMatch(/weeks/i);
  });

  it("keeps the one-click tier to things that really are one click", () => {
    const oneClick = oneClickItems(connectItemsFor(sub())).map((i) => i.id);
    expect(oneClick).toEqual(["social", "business_email"]);
  });

  it("puts everything needing a key, a DNS change, or an approval in the slower tier", () => {
    const slower = needsSetupItems(connectItemsFor(sub())).map((i) => i.id);
    expect(slower).toEqual(["calendar", "domain", "mls", "texting"]);
  });
});

describe("connected state reflects reality", () => {
  it("reads nothing as connected for a brand-new workspace", () => {
    expect(connectedCount(connectItemsFor(sub()))).toBe(0);
  });

  it("counts a connected Meta page", () => {
    const items = connectItemsFor(
      sub({
        metaConfig: {
          connected: true,
          capabilities: { inbox: true, publish: true },
        } as SubAccountDoc["metaConfig"],
      }),
    );
    expect(items.find((i) => i.id === "social")?.connected).toBe(true);
  });

  it("does not count a Resend domain still awaiting verification", () => {
    // "pending" cannot send yet, so a green tick here would promise mail is
    // going out as them when it is still leaving from the shared address.
    const items = connectItemsFor(
      sub({
        resendConfig: { status: "pending" } as SubAccountDoc["resendConfig"],
      }),
    );
    expect(items.find((i) => i.id === "business_email")?.connected).toBe(false);
  });

  it("counts a verified Resend domain as business email being sorted", () => {
    const items = connectItemsFor(
      sub({
        resendConfig: { status: "verified" } as SubAccountDoc["resendConfig"],
      }),
    );
    expect(items.find((i) => i.id === "business_email")?.connected).toBe(true);
  });

  it("does not count a domain whose state is merely unknown", () => {
    // `unknown` exists because a DNS match alone is not proof the domain is
    // actually served — the false-green-light case the domain verifier was
    // fixed to stop reporting.
    const items = connectItemsFor(
      sub({ customDomain: "example.test", customDomainState: "unknown" }),
    );
    expect(items.find((i) => i.id === "domain")?.connected).toBe(false);
  });

  it("counts a live domain", () => {
    const items = connectItemsFor(
      sub({ customDomain: "example.test", customDomainState: "live" }),
    );
    expect(items.find((i) => i.id === "domain")?.connected).toBe(true);
  });

  it("does not treat an enabled IDX config as connected without a stored key", () => {
    const items = connectItemsFor(
      sub({ idxConfig: { enabled: true, connected: false } as SubAccountDoc["idxConfig"] }),
    );
    expect(items.find((i) => i.id === "mls")?.connected).toBe(false);
  });

  it("counts dedicated texting only when it is switched on", () => {
    const off = connectItemsFor(
      sub({ twilioConfig: { enabled: false } as SubAccountDoc["twilioConfig"] }),
    );
    expect(off.find((i) => i.id === "texting")?.connected).toBe(false);

    const on = connectItemsFor(
      sub({ twilioConfig: { enabled: true } as SubAccountDoc["twilioConfig"] }),
    );
    expect(on.find((i) => i.id === "texting")?.connected).toBe(true);
  });
});
