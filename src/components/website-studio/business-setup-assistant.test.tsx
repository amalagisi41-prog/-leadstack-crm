import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BusinessSetupAssistant } from "./business-setup-assistant";
import type { OnboardingFoundation } from "@/types/onboarding-foundation";

/**
 * Website Studio's "Setup Assistant" tab.
 *
 * The bug these cover: once the foundation was saved the whole section
 * collapsed into a banner reading "there is nothing to repeat here; return to
 * Vibe Builder" — with no link to Vibe Builder, no record of what had been
 * saved, and no route to Domain settings. It told the user to leave and gave
 * them no door. Editing domain/hosting now happens in exactly one place —
 * the standalone Domain page — so this screen only reports status and links
 * out; it no longer has its own inline edit form.
 */

const toastError = vi.fn();
const toastSuccess = vi.fn();

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
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const SAVED: OnboardingFoundation = {
  completed: true,
  mode: "foundation",
  sourcePlatform: null,
  sourceUrl: "",
  domainStartingPoint: "have_domain",
  hostingStartingPoint: "agentstack_managed",
  domainName: "example-realty.test",
  domainSetupConfirmed: true,
  hostingSetupConfirmed: true,
  profileImported: false,
};

function mockApi(foundation: OnboardingFoundation | null = SAVED) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock = vi.fn(
    async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body) : undefined,
      });
      return {
        ok: true,
        json: async () => ({
          foundation: init?.body ? JSON.parse(init.body) : foundation,
        }),
      };
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

async function renderComplete() {
  render(<BusinessSetupAssistant foundationComplete />);
  await screen.findByText("Website foundation is complete");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  toastError.mockClear();
  toastSuccess.mockClear();
});

describe("completed foundation — the screen must not dead-end", () => {
  // The shared Button renders an anchor carrying role="button", which
  // overrides the implicit link role — hence getByRole("button") plus an
  // href assertion rather than getByRole("link").
  it("links to Vibe Builder instead of only naming it", async () => {
    mockApi();
    await renderComplete();

    // The old copy said "return to Vibe Builder" with nothing to click.
    expect(
      screen.getByRole("button", { name: /continue in vibe builder/i })
    ).toHaveAttribute("href", "/sa/sub-1/website-studio/vibe");
  });

  it("offers a route to Domain settings the walkthrough otherwise skipped", async () => {
    mockApi();
    await renderComplete();

    expect(
      screen.getByRole("button", { name: /manage domain & hosting/i })
    ).toHaveAttribute("href", "/sa/sub-1/domain");
  });

  it("shows what was actually saved rather than asserting it", async () => {
    mockApi();
    await renderComplete();

    const summary = await screen.findByText(/managed from Domain settings/i);
    expect(summary).toHaveTextContent("example-realty.test");
    expect(summary).toHaveTextContent("AgentStack managed hosting");
  });

  it("names a saved migration path in plain language", async () => {
    mockApi({ ...SAVED, hostingStartingPoint: "transfer_existing" });
    await renderComplete();

    expect(
      await screen.findByText(/managed from Domain settings/i)
    ).toHaveTextContent("Migrating to a new host");
  });

  it("says so plainly when a field is not saved", async () => {
    mockApi({ ...SAVED, domainName: "", hostingStartingPoint: null });
    await renderComplete();

    const summary = await waitFor(() =>
      screen.getByText(/managed from Domain settings/i)
    );
    expect(summary).toHaveTextContent("Domain not saved yet");
    expect(summary).toHaveTextContent("Hosting not saved yet");
  });
});

describe("Hostinger path — saving must actually save", () => {
  it("persists the choice through the foundation PATCH", async () => {
    const { calls } = mockApi();
    render(<BusinessSetupAssistant />);
    await screen.findByText(/choose your domain and hosting before building/i);

    await userEvent.click(
      screen.getByRole("button", { name: /migrate an existing site/i })
    );
    await userEvent.click(
      screen.getByRole("button", { name: /save this hosting path/i })
    );

    const patch = await waitFor(() => {
      const call = calls.find((c) => c.method === "PATCH");
      expect(call).toBeDefined();
      return call!;
    });

    // Previously this only flipped a local checkbox and announced success —
    // a reload lost the choice entirely.
    expect(patch.body).toMatchObject({
      hostingStartingPoint: "transfer_existing",
      hostingSetupConfirmed: true,
      domainName: "example-realty.test",
    });
  });

  it("reports honestly when the domain step is still outstanding", async () => {
    const { calls } = mockApi({
      ...SAVED,
      domainName: "",
      domainSetupConfirmed: false,
      hostingStartingPoint: null,
      hostingSetupConfirmed: false,
    });
    render(<BusinessSetupAssistant />);
    await screen.findByText(/choose your domain and hosting before building/i);

    await userEvent.click(
      screen.getByRole("button", { name: /host a new website/i })
    );
    await userEvent.click(
      screen.getByRole("button", { name: /save this hosting path/i })
    );

    expect(toastError).toHaveBeenCalledWith(
      "Complete and confirm the domain and hosting steps first."
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });
});
