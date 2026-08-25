import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DomainConnect } from "./domain-connect";
import type { OnboardingFoundation } from "@/types/onboarding-foundation";

let customDomain: string | null = null;

vi.mock("@/context/sub-account-context", () => ({
  useSubAccount: () => ({
    subAccountId: "sub-1",
    subAccount: { id: "sub-1", customDomain },
    saPath: (path: string) => `/sa/sub-1${path}`,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type Routes = { foundation?: Partial<OnboardingFoundation> | null };

function mockApi({ foundation = null }: Routes = {}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock = vi.fn(
    async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body) : undefined,
      });
      if (url.includes("onboarding-foundation")) {
        return {
          ok: true,
          json: async () => ({
            foundation: init?.body ? JSON.parse(init.body) : foundation,
          }),
        };
      }
      if (url.includes("website-transfer")) {
        return { ok: true, json: async () => ({ transfer: null }) };
      }
      if (url.includes("/domain")) {
        return {
          ok: true,
          json: async () => ({
            domain: JSON.parse(init?.body ?? "{}").domain ?? null,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

async function renderLoaded() {
  render(<DomainConnect />);
  await waitFor(() =>
    expect(screen.queryByText(/loading saved setup/i)).not.toBeInTheDocument()
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  customDomain = null;
});

describe("external-host-only domain setup", () => {
  it("shows domain and external-host setup without a hosting offer", async () => {
    customDomain = "example-realty.test";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have one — keep it where it is"));

    expect(screen.getByText("Connect your domain")).toBeInTheDocument();
    expect(screen.getByText("Connect your host")).toBeInTheDocument();
    expect(screen.getByText("Verify your domain")).toBeInTheDocument();
    expect(screen.queryByText("Point DNS")).not.toBeInTheDocument();
    expect(screen.queryByText("Host with AgentStack")).not.toBeInTheDocument();
    expect(screen.queryByText("Move my site to a new host")).not.toBeInTheDocument();
  });

  it("does not offer provider signup or migration links", async () => {
    customDomain = "example-realty.test";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have one — keep it where it is"));
    await userEvent.click(screen.getByText("Use my external host"));

    expect(screen.getByText(/does not provide hosting or change where your site is served/i)).toBeInTheDocument();
    expect(screen.queryByText(/don't have a host yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open hostinger/i })).not.toBeInTheDocument();
  });

  it("lets the customer name an existing external host", async () => {
    customDomain = "example-realty.test";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have one — keep it where it is"));
    await userEvent.click(screen.getByText("Use my external host"));

    const picker = screen.getByLabelText(/who hosts it today/i);
    expect(within(picker).getByText(/WordPress\.com/i)).toBeInTheDocument();
    expect(within(picker).getByText("Hostinger")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect this host/i })).toBeInTheDocument();
  });

  it("saves the external-host path without a cutover destination", async () => {
    customDomain = "example-realty.test";
    const { calls } = mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have one — keep it where it is"));
    await userEvent.type(screen.getByLabelText(/current website address/i), "https://example-realty.test");
    await userEvent.type(screen.getByLabelText(/domain you own/i), "example-realty.test");
    await userEvent.click(screen.getByRole("button", { name: /save domain & current site/i }));
    await userEvent.click(screen.getByText("Use my external host"));
    await userEvent.selectOptions(screen.getByLabelText(/who hosts it today/i), "hostinger");
    await userEvent.click(screen.getByRole("button", { name: /connect this host/i }));

    await waitFor(() => {
      const save = calls.find(
        (call) => call.url.includes("onboarding-foundation") && call.method === "PATCH"
      );
      expect(save?.body).toMatchObject({
        hostingStartingPoint: "keep_existing",
        hostingSetupConfirmed: true,
        sourcePlatform: "hostinger",
      });
    });
  });

  it("does not offer AgentStack hosting for a new website", async () => {
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I don't have a website"));

    expect(screen.getByText("Connect your host")).toBeInTheDocument();
    expect(screen.queryByText("Host with AgentStack")).not.toBeInTheDocument();
    expect(screen.queryByText(/register a domain at hostinger/i)).not.toBeInTheDocument();
  });
});
