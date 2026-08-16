import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BusinessSetupAssistant } from "./business-setup-assistant";
import type { OnboardingFoundation } from "@/types/onboarding-foundation";

/**
 * The Website & Domain tab.
 *
 * The bug these cover: once the foundation was saved the whole section
 * collapsed into a banner reading "there is nothing to repeat here; return to
 * Vibe Builder" — with no link to Vibe Builder, no record of what had been
 * saved, no way to change it, and no route to the DNS step. It told the user
 * to leave and gave them no door.
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
  domainName: "artisanhomenetwork.com",
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

  it("offers a route to the DNS step the walkthrough otherwise skipped", async () => {
    mockApi();
    await renderComplete();

    expect(
      screen.getByRole("button", { name: /domain, hosting & DNS steps/i })
    ).toHaveAttribute("href", "/sa/sub-1/domain");
  });

  it("shows what was actually saved rather than asserting it", async () => {
    mockApi();
    await renderComplete();

    expect(await screen.findByText("artisanhomenetwork.com")).toBeInTheDocument();
    expect(
      screen.getByText("AgentStack managed hosting")
    ).toBeInTheDocument();
  });

  it("names a saved migration path in plain language", async () => {
    mockApi({ ...SAVED, hostingStartingPoint: "transfer_existing" });
    await renderComplete();

    expect(
      await screen.findByText("Migrating to a new host")
    ).toBeInTheDocument();
  });

  it("says so plainly when a field is not saved", async () => {
    mockApi({ ...SAVED, domainName: "", hostingStartingPoint: null });
    await renderComplete();

    await waitFor(() =>
      expect(screen.getAllByText("Not saved yet")).toHaveLength(2)
    );
  });
});

describe("completed foundation — changing a saved choice", () => {
  it("reopens the setup form, honoring 'you can change providers later'", async () => {
    mockApi();
    await renderComplete();

    await userEvent.click(
      screen.getByRole("button", { name: /change domain or hosting/i })
    );

    expect(
      screen.getByText(/choose your domain and hosting before building/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save changes/i })
    ).toBeInTheDocument();
  });

  it("can back out of the reopened form without saving", async () => {
    const { calls } = mockApi();
    await renderComplete();

    await userEvent.click(
      screen.getByRole("button", { name: /change domain or hosting/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      await screen.findByText("Website foundation is complete")
    ).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("keeps the saved values populated when reopened", async () => {
    mockApi();
    await renderComplete();

    await userEvent.click(
      screen.getByRole("button", { name: /change domain or hosting/i })
    );

    // Re-editing must not start from a blank form and silently drop the
    // domain when saved again.
    expect(
      screen.getByDisplayValue("artisanhomenetwork.com")
    ).toBeInTheDocument();
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
      domainName: "artisanhomenetwork.com",
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
