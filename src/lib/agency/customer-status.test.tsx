import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { buildCustomerStatus, type WorkspaceConnectionInputs } from "./customer-status";
import { CustomerStatusTab } from "@/components/agency/customer-status-tab";

/**
 * Regression guard: customer-rendered Status strings must never contain
 * internal terms — env-var names, secret names, vendor-internal service
 * names, "server logs", or "Launch blocked".
 */
const ROOT = join(__dirname, "../../..");
const envNames = readFileSync(join(ROOT, ".env.example"), "utf8")
  .split("\n")
  .map((l) => l.match(/^\s*#?\s*([A-Z][A-Z0-9_]{3,})=/)?.[1])
  .filter((n): n is string => !!n);

export const INTERNAL_TERMS = [
  ...envNames,
  "server logs",
  "launch blocked",
  "hmac",
  "qstash",
  "upstash",
  "resend",
  "twilio",
  "firecrawl",
  "vapi",
  "gitpage",
  "mapbox",
  "openrouter",
  "env var",
  "environment variable",
  "secret",
  "api key",
  "not configured",
];

function offenders(text: string): string[] {
  const lower = text.toLowerCase();
  return INTERNAL_TERMS.filter((t) => lower.includes(t.toLowerCase()));
}

function allInputs(): WorkspaceConnectionInputs[] {
  const out: WorkspaceConnectionInputs[] = [];
  for (let mask = 0; mask < 1 << 7; mask++) {
    const b = (i: number) => (mask & (1 << i)) !== 0;
    out.push({
      subAccountId: `sa_${mask}`,
      subAccountName: "Main",
      emailWorks: b(0),
      emailConnectAvailable: b(1),
      textingWorks: b(2),
      socialOffered: b(3),
      socialConnected: b(4),
      listingsOffered: b(5),
      listingsConnected: b(6),
    });
  }
  return out;
}

describe("customer Status copy", () => {
  it("reads internal names from .env.example", () => {
    expect(envNames.length).toBeGreaterThan(10);
  });

  it("never contains internal terms, for every input combination", () => {
    for (const item of buildCustomerStatus(allInputs())) {
      for (const s of [item.title, item.body, item.actionLabel ?? ""]) {
        expect(offenders(s), s).toEqual([]);
      }
      if (item.state === "action") expect(item.actionLabel && item.href).toBeTruthy();
    }
  });

  it("omits email entirely when the customer cannot connect it (operator-only problem)", () => {
    const items = buildCustomerStatus([{ ...allInputs()[0], emailWorks: false, emailConnectAvailable: false }]);
    expect(items.some((i) => i.kind === "email")).toBe(false);
  });

  it("rendered tab text contains no internal terms", () => {
    const items = buildCustomerStatus(allInputs().slice(0, 40));
    for (const props of [
      { items, loading: false, error: null },
      { items: null, loading: true, error: null },
      { items: null, loading: false, error: "load_failed" },
      { items: [], loading: false, error: null },
    ]) {
      const { container, unmount } = render(<CustomerStatusTab {...props} />);
      expect(offenders(container.textContent ?? "")).toEqual([]);
      unmount();
    }
  });
});
