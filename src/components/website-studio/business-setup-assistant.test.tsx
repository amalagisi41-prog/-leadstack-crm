import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BusinessSetupAssistant } from "./business-setup-assistant";
import type { OnboardingFoundation } from "@/types/onboarding-foundation";

vi.mock("@/context/sub-account-context", () => ({
  useSubAccount: () => ({
    subAccountId: "sub-1",
    saPath: (path: string) => `/sa/sub-1${path}`,
  }),
}));

vi.mock("@/hooks/use-agency", () => ({
  useAgency: () => ({ name: "AgentStack" }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const SAVED: OnboardingFoundation = {
  completed: true,
  mode: "foundation",
  sourcePlatform: null,
  sourceUrl: "",
  domainStartingPoint: "have_domain",
  hostingStartingPoint: "keep_existing",
  domainName: "example-realty.test",
  domainSetupConfirmed: true,
  hostingSetupConfirmed: true,
  profileImported: false,
};

function mockApi(foundation: OnboardingFoundation | null = SAVED) {
  const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => ({
    ok: true,
    json: async () => ({
      foundation: url.includes("onboarding-foundation") && init?.body
        ? JSON.parse(init.body)
        : foundation,
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => vi.unstubAllGlobals());

describe("external-host-only setup assistant", () => {
  it("reports the saved external host and links to Domain settings", async () => {
    mockApi();
    render(<BusinessSetupAssistant foundationComplete />);

    expect(await screen.findByText("Website foundation is complete")).toBeInTheDocument();
    expect(screen.getByText(/managed from Domain settings/i)).toHaveTextContent(
      "example-realty.test"
    );
    expect(screen.getByText(/managed from Domain settings/i)).toHaveTextContent(
      "Staying on your current host"
    );
    expect(
      screen.getByRole("button", { name: /manage domain & external host/i })
    ).toHaveAttribute("href", "/sa/sub-1/domain");
  });

  it("offers only an external host and never AgentStack hosting", async () => {
    mockApi(null);
    render(<BusinessSetupAssistant />);

    expect(
      await screen.findByText(/confirm your domain and external host/i)
    ).toBeInTheDocument();
    expect(screen.getByText("My external host")).toBeInTheDocument();
    expect(screen.queryByText(/AgentStack Managed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hostinger website migration/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /host a new website/i })).not.toBeInTheDocument();
    expect(screen.getByText(/does not provide website hosting/i)).toBeInTheDocument();
  });

  it("uses external-host language for the confirmation step", async () => {
    mockApi(null);
    render(<BusinessSetupAssistant />);

    await screen.findByText(/confirm your domain and external host/i);
    await userEvent.click(screen.getByText("My external host"));

    expect(screen.getByText(/confirmed the external provider that serves my site/i)).toBeInTheDocument();
    expect(screen.queryByText(/managed hosting/i)).not.toBeInTheDocument();
  });
});
