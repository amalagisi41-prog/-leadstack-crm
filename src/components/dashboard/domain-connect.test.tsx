import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DomainConnect } from "./domain-connect";
import type { OnboardingFoundation } from "@/types/onboarding-foundation";

/**
 * The Website & Domain walkthrough.
 *
 * The bug these cover: after choosing a domain path the page dead-ended.
 * Hosting showed "Not started" with no control to change it, and the only
 * action anywhere was an unlabeled Hostinger link. The step-2 tests exist to
 * make sure hosting stays reachable, and the save test guards the foundation
 * PATCH contract — it replaces the stored object rather than merging, so a
 * partial payload silently erases progress made earlier in onboarding.
 */

const openAskAssistant = vi.fn();
let customDomain: string | null = null;

vi.mock("@/context/sub-account-context", () => ({
  useSubAccount: () => ({
    subAccountId: "sub-1",
    subAccount: { id: "sub-1", customDomain },
    saPath: (path: string) => `/sa/sub-1${path}`,
  }),
}));

vi.mock("@/components/dashboard/ask-assistant-panel", () => ({
  openAskAssistant: (...args: unknown[]) => openAskAssistant(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type Routes = {
  foundation?: Partial<OnboardingFoundation> | null;
  transfer?: Record<string, unknown> | null;
};

/** Route the component's three endpoints; record every request for assertions. */
function mockApi({ foundation = null, transfer = null }: Routes = {}) {
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
        return { ok: true, json: async () => ({ transfer }) };
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
  return { fetchMock, calls };
}

/** Wait past the initial foundation + transfer loads. */
async function renderLoaded() {
  render(<DomainConnect />);
  await waitFor(() =>
    expect(screen.queryByText(/loading saved setup/i)).not.toBeInTheDocument()
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  openAskAssistant.mockClear();
  customDomain = null;
});

describe("Website & Domain — the three steps are always visible", () => {
  it("shows all three numbered steps once a situation is chosen", async () => {
    customDomain = "example-realty.test";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));

    expect(screen.getByText("Connect your domain")).toBeInTheDocument();
    expect(screen.getByText("Connect your host")).toBeInTheDocument();
    expect(screen.getByText("Point DNS")).toBeInTheDocument();
  });

  it("prompts for a situation before showing any step", async () => {
    mockApi();
    await renderLoaded();

    expect(
      screen.getByText(/choose your situation above/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Connect your host")).not.toBeInTheDocument();
  });
});

describe("Website & Domain — step 2 is reachable", () => {
  it("locks hosting until a domain is actually saved", async () => {
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));

    // Both hosting and DNS are out of reach until the domain is saved.
    expect(screen.getAllByText("Locked")).toHaveLength(2);
    expect(
      screen.getByText(/save your domain in step 1 first/i)
    ).toBeInTheDocument();
  });

  it("does not unlock on typing, only on a persisted domain", async () => {
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));
    await userEvent.type(
      screen.getByLabelText(/domain you own/i),
      "example-realty.test"
    );

    expect(
      screen.getByText(/save your domain in step 1 first/i)
    ).toBeInTheDocument();
  });

  it("offers keep-or-transfer for an agent who already has a site", async () => {
    customDomain = "example-realty.test";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));

    expect(screen.getByText("Keep my current host")).toBeInTheDocument();
    expect(screen.getByText("Move my site to a new host")).toBeInTheDocument();
    // Nothing to transfer when there is no existing site.
    expect(screen.queryByText("Host with AgentStack")).not.toBeInTheDocument();
  });

  it("offers AgentStack hosting for an agent building their first site", async () => {
    customDomain = "yournamehomes.com";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I need a website"));

    expect(screen.getByText("Host with AgentStack")).toBeInTheDocument();
    expect(screen.getByText("I already have hosting")).toBeInTheDocument();
    expect(
      screen.queryByText("Move my site to a new host")
    ).not.toBeInTheDocument();
  });

  it("lets an existing host be named — the case that had no control at all", async () => {
    customDomain = "example-realty.test";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));
    await userEvent.click(screen.getByText("Keep my current host"));

    const picker = screen.getByLabelText(/who hosts it today/i);
    expect(
      within(picker).getByText(/WordPress\.com \(hosted by WordPress\)/i)
    ).toBeInTheDocument();
    expect(within(picker).getByText("GoHighLevel")).toBeInTheDocument();

    // Hostinger is the migration and new-site partner this product promotes,
    // so an agent who took that recommendation has to be able to say so.
    expect(within(picker).getByText("Hostinger")).toBeInTheDocument();

    // "My site runs WordPress" and "WordPress.com hosts my site" are different
    // answers. Offering only the latter sent self-hosted WordPress agents to
    // wordpress.com instead of their real control panel.
    expect(
      within(picker).getByText("WordPress on another host")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /connect this host/i })
    ).toBeInTheDocument();
  });

  it("labels the Hostinger step instead of leaving a bare link", async () => {
    customDomain = "example-realty.test";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));
    await userEvent.click(screen.getByText("Move my site to a new host"));

    expect(
      screen.getByText(/hostinger — free website transfer/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start the transfer at hostinger/i })
    ).toBeInTheDocument();
  });
});

describe("Website & Domain — saving hosting", () => {
  it("sends the complete foundation, since the PATCH replaces it wholesale", async () => {
    customDomain = "example-realty.test";
    const { calls } = mockApi({
      foundation: {
        completed: false,
        mode: "transfer",
        sourcePlatform: null,
        sourceUrl: "https://example-realty.test",
        domainStartingPoint: "have_domain",
        hostingStartingPoint: null,
        domainName: "example-realty.test",
        profileImported: true,
      },
    });
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));
    await userEvent.click(screen.getByText("Keep my current host"));
    await userEvent.selectOptions(
      screen.getByLabelText(/who hosts it today/i),
      "wordpress"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /connect this host/i })
    );

    const patch = await waitFor(() => {
      const call = calls.find(
        (c) => c.url.includes("onboarding-foundation") && c.method === "PATCH"
      );
      expect(call).toBeDefined();
      return call!;
    });

    expect(patch.body).toMatchObject({
      mode: "transfer",
      hostingStartingPoint: "keep_existing",
      sourcePlatform: "wordpress",
      hostingSetupConfirmed: true,
      domainName: "example-realty.test",
      domainSetupConfirmed: true,
      // Progress made earlier in onboarding must survive the replace.
      profileImported: true,
      sourceUrl: "https://example-realty.test",
    });
  });

  it("does not confirm a transfer that the provider has not completed", async () => {
    customDomain = "example-realty.test";
    const { calls } = mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));
    await userEvent.click(screen.getByText("Move my site to a new host"));
    await userEvent.click(
      screen.getByRole("button", { name: /save this path/i })
    );

    const patch = await waitFor(() => {
      const call = calls.find(
        (c) => c.url.includes("onboarding-foundation") && c.method === "PATCH"
      );
      expect(call).toBeDefined();
      return call!;
    });

    expect(patch.body).toMatchObject({
      hostingStartingPoint: "transfer_existing",
      hostingSetupConfirmed: false,
    });
  });

  it("confirms the connection once a host is saved", async () => {
    customDomain = "example-realty.test";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));
    await userEvent.click(screen.getByText("Keep my current host"));
    await userEvent.click(
      screen.getByRole("button", { name: /connect this host/i })
    );

    expect(
      await screen.findByText(/connected to WordPress\.com/i)
    ).toBeInTheDocument();
  });
});

describe("Website & Domain — step 3 names what is missing", () => {
  it("lists the outstanding prerequisites rather than only 'locked'", async () => {
    customDomain = "example-realty.test";
    mockApi();
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));

    expect(screen.getByText("Domain saved")).toBeInTheDocument();
    expect(screen.getByText("Host connected")).toBeInTheDocument();
    expect(screen.getByText(/verified over HTTPS/i)).toBeInTheDocument();
    expect(screen.getByText(/finish step 2 to unlock/i)).toBeInTheDocument();
  });

  it("tells an agent staying put that there is no DNS change to make", async () => {
    customDomain = "example-realty.test";
    mockApi({
      foundation: {
        completed: true,
        mode: "transfer",
        sourcePlatform: "wordpress",
        sourceUrl: "",
        domainStartingPoint: "have_domain",
        hostingStartingPoint: "keep_existing",
        hostingSetupConfirmed: true,
        domainName: "example-realty.test",
        profileImported: false,
      },
    });
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));

    // Leaving this step "locked" forever implied unfinished work that will
    // never exist — there is no cutover when the host is not changing.
    expect(
      screen.getByText("DNS — no change needed for this path")
    ).toBeInTheDocument();
    expect(screen.queryByText("Locked")).not.toBeInTheDocument();

    // But do not claim to have verified DNS we never looked up. This state is
    // derived from the agent's own answer about their host, and when that
    // answer is wrong the old copy confirmed a broken setup as correct.
    expect(screen.getByText(/Based on your answer/i)).toBeInTheDocument();
    expect(
      screen.getByText(/haven't checked your DNS records/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/already points where it should/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/record values stay hidden/i)
    ).not.toBeInTheDocument();
  });

  it("keeps DNS record values hidden until the hosted site is verified", async () => {
    customDomain = "example-realty.test";
    mockApi({
      foundation: {
        completed: true,
        mode: "transfer",
        sourcePlatform: "wordpress",
        sourceUrl: "",
        domainStartingPoint: "have_domain",
        // A migration does have a cutover, so the gate still applies.
        hostingStartingPoint: "transfer_existing",
        hostingSetupConfirmed: true,
        domainName: "example-realty.test",
        profileImported: false,
      },
    });
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));

    const dnsButton = screen.getByRole("button", {
      name: /ask Zack about nameservers & DNS/i,
    });
    expect(dnsButton).toBeEnabled();
    // The gate now says what it depends on AND that it opens by itself. It
    // used to read a field no code ever wrote, so the only way past it was to
    // contact support.
    expect(screen.getByText(/nothing to request/i)).toBeInTheDocument();

    await userEvent.click(dnsButton);
    expect(openAskAssistant).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Do not give me record values until my hosted site is verified"
        ),
      })
    );
  });

  it("hands Zack the real domain and host so guidance is specific", async () => {
    customDomain = "example-realty.test";
    mockApi({
      foundation: {
        completed: true,
        mode: "transfer",
        sourcePlatform: "godaddy",
        sourceUrl: "",
        domainStartingPoint: "have_domain",
        hostingStartingPoint: "keep_existing",
        hostingSetupConfirmed: true,
        domainName: "example-realty.test",
        profileImported: false,
      },
    });
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));
    await userEvent.click(
      screen.getByRole("button", { name: /ask Zack about nameservers & DNS/i })
    );

    const { prompt } = openAskAssistant.mock.calls[0][0] as { prompt: string };
    expect(prompt).toContain("example-realty.test");
    expect(prompt).toContain("GoDaddy");
  });

  it("unlocks the record values once the hosted site is verified", async () => {
    customDomain = "example-realty.test";
    mockApi({
      transfer: {
        hostingStatus: "ready",
        hostingUrl: "https://example-realty.test",
        sourceUrl: "https://example-realty.test",
      },
    });
    await renderLoaded();
    await userEvent.click(screen.getByText("I have a website"));

    expect(
      screen.getByRole("button", { name: /get my DNS records from Zack/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Ready for review")).toBeInTheDocument();
  });
});

describe("Website & Domain — status summary", () => {
  it("reports the connected host by name rather than 'Not started'", async () => {
    customDomain = "example-realty.test";
    mockApi({
      foundation: {
        completed: true,
        mode: "transfer",
        sourcePlatform: "bluehost",
        sourceUrl: "",
        domainStartingPoint: "have_domain",
        hostingStartingPoint: "keep_existing",
        hostingSetupConfirmed: true,
        domainName: "example-realty.test",
        profileImported: false,
      },
    });
    await renderLoaded();

    expect(screen.getAllByText("Bluehost").length).toBeGreaterThan(0);
    expect(screen.getByText("example-realty.test")).toBeInTheDocument();
    expect(screen.queryByText("Not started")).not.toBeInTheDocument();
  });

  it("falls back to the foundation when the sub-account has no domain yet", async () => {
    customDomain = null;
    mockApi({
      foundation: {
        completed: true,
        mode: "fresh",
        sourcePlatform: null,
        sourceUrl: "",
        domainStartingPoint: "have_domain",
        hostingStartingPoint: null,
        domainName: "legacy-domain.com",
        profileImported: false,
      },
    });
    await renderLoaded();

    expect(screen.getByText("legacy-domain.com")).toBeInTheDocument();
  });
});
