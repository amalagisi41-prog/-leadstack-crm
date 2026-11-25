import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgencyBillingSection } from "./agency-billing-section";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const summary = {
  currentPlanKey: "starter",
  currentPlanName: "AgentStack Solo",
  subscriptionStatus: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  activeAddOnKeys: [],
  activeAddOnCount: 0,
  bundleDiscountActive: false,
  bundleCouponConfigured: false,
  lineItems: [],
};

function stub(switchablePlanKeys: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, summary, unbilledAddOns: [], switchablePlanKeys }) })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Billing plan choices", () => {
  it("offers no Switch to Team while Team isn't purchasable; Solo is the Current plan", async () => {
    stub(["starter"]);
    render(<AgencyBillingSection />);
    expect(await screen.findByText("Current plan")).toBeInTheDocument();
    expect(screen.queryByText(/Switch to Team/)).toBeNull();
  });

  it("brings Switch to Team back automatically once Team is purchasable", async () => {
    stub(["starter", "pro"]);
    render(<AgencyBillingSection />);
    expect(await screen.findByText(/Switch to Team/)).toBeInTheDocument();
  });
});
