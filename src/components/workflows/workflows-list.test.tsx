import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowsList } from "./workflows-list";

/**
 * The Follow-Up Plans list.
 *
 * The bug these cover: a workflow that cannot run looked exactly like one that
 * can. The provisioning seeder pauses the Method Templates when QStash isn't
 * configured and writes a `pausedReason` saying why — and the list rendered
 * neither, so an agent saw four plans sitting there with no explanation. Worse,
 * workspaces provisioned before that seeder fix still carry those plans marked
 * ACTIVE: the engine enrols the lead, increments the counter, and sends
 * nothing. "Answer every new lead within 60 seconds" silently not happening is
 * the single worst failure this product has.
 */

const openAskAssistant = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/dashboard/ask-assistant-panel", () => ({
  openAskAssistant: (...args: unknown[]) => openAskAssistant(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type Row = {
  id: string;
  name: string;
  status: string;
  trigger: { type: string };
  stats?: { enrolled?: number };
  pausedReason?: string | null;
};

const SEEDED_REASON =
  "Automatic sending isn't configured on this deployment yet, so this " +
  "workflow is paused rather than enrolling leads it can't contact. " +
  "Add your QStash keys, then turn it on.";

function mockApi(opts: { workflows: Row[]; configured: boolean }) {
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
          workflows: opts.workflows,
          automaticSendingConfigured: opts.configured,
        }),
      };
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

/** Wait past the initial list load. */
async function renderLoaded() {
  render(<WorkflowsList saId="sub-1" />);
  await waitFor(() =>
    expect(screen.getByText("Answer new leads fast")).toBeInTheDocument()
  );
}

function paused(): Row {
  return {
    id: "wf-1",
    name: "Answer new leads fast",
    status: "paused",
    trigger: { type: "contact.created" },
    stats: { enrolled: 0 },
    pausedReason: SEEDED_REASON,
  };
}

function active(): Row {
  return {
    id: "wf-1",
    name: "Answer new leads fast",
    status: "active",
    trigger: { type: "contact.created" },
    stats: { enrolled: 41 },
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  openAskAssistant.mockClear();
});

describe("Follow-Up Plans — a paused plan explains itself", () => {
  it("shows why the system paused it instead of an unexplained badge", async () => {
    mockApi({ workflows: [paused()], configured: false });
    await renderLoaded();

    // "Paused" alone tells a first-time agent nothing — least of all that they
    // did not do this and cannot fix it from the workflow itself.
    expect(screen.getByText(SEEDED_REASON)).toBeInTheDocument();
  });

  it("offers a way out rather than leaving the agent at a dead end", async () => {
    mockApi({ workflows: [paused()], configured: false });
    await renderLoaded();

    await userEvent.click(
      screen.getByRole("button", { name: /set up automatic sending/i })
    );
    expect(openAskAssistant).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("QStash"),
      })
    );
  });

  it("does not offer 'Turn it on' while turning it on would change nothing", async () => {
    // Enabling a workflow the deployment still cannot run just converts a
    // visible pause into a silent failure. The blocker has to clear first.
    mockApi({ workflows: [paused()], configured: false });
    await renderLoaded();

    expect(
      screen.queryByRole("button", { name: /turn it on/i })
    ).not.toBeInTheDocument();
  });
});

describe("Follow-Up Plans — once sending is configured", () => {
  it("says the blocker is gone and puts the remaining action in reach", async () => {
    mockApi({ workflows: [paused()], configured: true });
    await renderLoaded();

    expect(
      screen.getByText(/automatic sending is set up now/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /turn it on/i })
    ).toBeInTheDocument();
  });

  it("activates the workflow from the list", async () => {
    const { calls } = mockApi({ workflows: [paused()], configured: true });
    await renderLoaded();

    await userEvent.click(screen.getByRole("button", { name: /turn it on/i }));

    const patch = await waitFor(() => {
      const call = calls.find((c) => c.method === "PATCH");
      expect(call).toBeDefined();
      return call!;
    });
    expect(patch.url).toContain("/workflows/wf-1");
    expect(patch.body).toMatchObject({ status: "active" });
  });
});

describe("Follow-Up Plans — active but silent", () => {
  it("warns when an Active plan cannot actually send", async () => {
    // This is the state every workspace provisioned before the seeder fix is
    // in. Deriving the warning from live config rather than from stored data
    // means those workspaces are covered without a backfill, and the warning
    // disappears by itself once the keys are added.
    mockApi({ workflows: [active()], configured: false });
    await renderLoaded();

    expect(screen.getByText(/on, but nothing is being sent/i)).toBeInTheDocument();
    expect(
      screen.getByText(/enrolled in this plan and then never contacted/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /how do i fix this/i })
    ).toBeInTheDocument();
  });

  it("stays quiet when the deployment can send", async () => {
    mockApi({ workflows: [active()], configured: true });
    await renderLoaded();

    expect(
      screen.queryByText(/on, but nothing is being sent/i)
    ).not.toBeInTheDocument();
  });

  it("treats an older API response without the flag as healthy", async () => {
    // A cached or rolling deployment can serve the list without the new field.
    // Defaulting that to "broken" would paint a red banner across every row in
    // a workspace that is working perfectly well.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ workflows: [active()] }),
      }))
    );
    await renderLoaded();

    expect(
      screen.queryByText(/on, but nothing is being sent/i)
    ).not.toBeInTheDocument();
  });
});
