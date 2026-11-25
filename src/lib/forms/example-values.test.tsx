import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  EXAMPLE_VALUES,
  examplePlaceholder,
  isExampleValue,
  realValueOrEmpty,
} from "./example-values";
import { MessagingSection } from "@/components/agency/messaging-section";

describe("example values are never data", () => {
  it("treats every stored example as empty", () => {
    for (const v of Object.values(EXAMPLE_VALUES)) {
      expect(isExampleValue(v)).toBe(true);
      expect(realValueOrEmpty(v)).toBe("");
      expect(realValueOrEmpty(` ${v.toUpperCase()} `)).toBe("");
    }
    expect(realValueOrEmpty("Harbor Realty")).toBe("Harbor Realty");
    expect(realValueOrEmpty(null)).toBe("");
  });

  it("placeholders are visibly marked as examples", () => {
    expect(examplePlaceholder(EXAMPLE_VALUES.contactName)).toBe("e.g. Jane Doe");
  });
});

describe("Agency Messaging section", () => {
  afterEach(() => vi.unstubAllGlobals());

  const config = (internal: boolean) => ({
    internal,
    sms: { configured: false, fromNumber: null, accountSidMasked: internal ? "AC••••1234" : null, authTokenSet: internal ? false : null, sharedAllowed: true },
    email: { configured: true, fromAddress: "notify@example.test", apiKeySet: internal ? true : null },
  });

  it("customers see status and actions, never deployment instructions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => config(false) })));
    const { container } = render(<MessagingSection />);
    await screen.findByText("Text messaging");
    const text = container.textContent ?? "";
    for (const term of ["environment variable", "redeploy", "TWILIO_", "RESEND_", "EMAIL_FROM", "Account SID", "API key", "Twilio", "Resend"]) {
      expect(text).not.toContain(term);
    }
    expect(text).toContain("connect its own phone number");
  });

  it("the operator sees the internal details, labelled Internal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => config(true) })));
    const { container } = render(<MessagingSection />);
    await screen.findByText("Text messaging");
    expect(container.textContent).toContain("redeploy");
    expect(container.textContent).toContain("Internal");
  });
});
