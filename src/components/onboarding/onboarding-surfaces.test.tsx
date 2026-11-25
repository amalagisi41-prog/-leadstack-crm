import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computeMethodProgress, setupBadgeText, type MethodProgress } from "@/lib/onboarding/method";
import { computeSetupProgress } from "@/lib/onboarding/setup-progress";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * The onboarding surfaces against one fixed workspace:
 * - the dashboard card, the setup pill, the sidebar badge and the setup hub
 *   all show the same "x of 6" / percent;
 * - the full step list is one click from the dashboard;
 * - an auto-opened setup pop-up that was closed never re-opens on navigation.
 */

// Two Method steps done (Build, Connect), Capture in progress.
const SUB = {
  name: "Test Realty",
  twilioConfig: { enabled: true },
  setupSkippedSteps: ["listings", "social"],
} as unknown as SubAccountDoc;
const METHOD: MethodProgress = computeMethodProgress({
  setupDone: { identity: true, communications: true, listings: false, social: false, domain: false },
  skipped: ["listings", "social"],
  checklistDone: ["business_profile", "contacts", "form"],
});
const SETUP = computeSetupProgress(SUB, true);

const nav = vi.hoisted(() => ({ pathname: "/sa/sa1/dashboard" }));
const gate = vi.hoisted(() => ({
  shown: false,
  dismissedAt: null as number | null,
  dismissCalls: 0,
}));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-method-progress", () => ({
  useMethodProgress: () => ({ method: METHOD, setup: SETUP, loading: false }),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }));
vi.mock("@/context/sub-account-context", () => ({
  useSubAccount: () => ({
    subAccountId: "sa1",
    subAccount: SUB,
    isAdmin: true,
    saPath: (p: string) => `/sa/sa1${p}`,
  }),
}));
vi.mock("@/lib/onboarding/prompt-gate-storage", () => ({
  readPromptGate: async () => ({ shownThisSession: gate.shown, dismissedAt: gate.dismissedAt, completedAt: null }),
  markPromptShownThisSession: () => {
    gate.shown = true;
  },
  markPromptDismissed: async () => {
    gate.shown = true;
    gate.dismissedAt = Date.now();
    gate.dismissCalls += 1;
  },
  markOnboardingCompleted: async () => undefined,
}));
// The real guided flows pull in Firestore and the dialog stack; a stub that
// shows whether it is open (and offers an X) is all these tests need.
vi.mock("@/components/onboarding/setup-guided-flows", () => {
  const Stub = ({ open, onOpenChange, step }: { open: boolean; onOpenChange: (o: boolean) => void; step?: string }) =>
    open ? (
      <div role="dialog" aria-label={`setup ${step ?? "flow"}`}>
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null;
  return { CommunicationsGuidedSetup: Stub, SocialGuidedSetup: Stub, SetupStepPrompt: Stub };
});

import { SetupHub } from "./setup-hub";
import { SetupProgressCard } from "./setup-progress-card";
import { SetupProgressPill } from "./setup-progress-pill";

beforeEach(() => {
  nav.pathname = "/sa/sa1/dashboard";
  gate.shown = false;
  gate.dismissedAt = null;
  gate.dismissCalls = 0;
});

const saPath = (p: string) => `/sa/sa1${p}`;

describe("progress agrees on every surface", () => {
  it("dashboard card, pill, sidebar badge and setup hub show the same numbers", async () => {
    expect(METHOD.completedCount).toBe(2);
    expect(METHOD.percent).toBe(33);

    const card = render(<SetupProgressCard progress={METHOD} subAccountId="sa1" saPath={saPath} />);
    expect(card.getByText("2 of 6 · 33%")).toBeInTheDocument();
    expect(card.getByText(/33% ready/)).toBeInTheDocument();
    card.unmount();

    const hub = render(<SetupHub subAccountId="sa1" subAccount={SUB} saPath={saPath} />);
    expect(hub.getByText(/2 of 6 steps complete · 33% ready/)).toBeInTheDocument();
    hub.unmount();

    gate.shown = true; // keep the pill from auto-opening in this test
    const pill = render(<SetupProgressPill />);
    expect(await pill.findByText(/^Setup: 2 of 6 — /)).toBeInTheDocument();
    // Docked in the page flow, never floating over content.
    expect(pill.getByRole("region", { name: "Setup progress" }).className).not.toMatch(/\bfixed\b/);
    // Dismiss hides it for the session once setup is underway.
    await act(async () => {
      pill.getByRole("button", { name: /hide setup progress/i }).click();
    });
    expect(pill.queryByRole("region", { name: "Setup progress" })).toBeNull();
    pill.unmount();
    sessionStorage.clear();

    expect(setupBadgeText(METHOD)).toBe("2/6");
  });

  it("the setup hub lists all six Method steps with a status each", () => {
    render(<SetupHub subAccountId="sa1" subAccount={SUB} saPath={saPath} />);
    for (const id of ["build", "connect", "capture", "respond", "nurture", "close"]) {
      expect(screen.getByTestId(`setup-hub-step-${id}`)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Complete")).toHaveLength(2);
    expect(screen.getAllByText("In progress")).toHaveLength(1);
    expect(screen.getAllByText("Not started")).toHaveLength(3);
    // Every task links to where it is done.
    expect(screen.getByRole("link", { name: /Turn on Speed-to-Lead/ })).toHaveAttribute("href", "/sa/sa1/workflows");
  });
});

describe("the full step list is one click from the dashboard", () => {
  it("'See all setup steps' on the dashboard card links straight to the setup hub", () => {
    render(<SetupProgressCard progress={METHOD} subAccountId="sa1" saPath={saPath} />);
    expect(screen.getByTestId("see-all-setup-steps")).toHaveAttribute("href", "/agency/get-started?sa=sa1");
  });

  it("the pill's 'See all setup steps' goes to the same hub, not the redirecting Setup page", async () => {
    gate.shown = true;
    render(<SetupProgressPill />);
    expect(await screen.findByRole("link", { name: /See all setup steps/ })).toHaveAttribute(
      "href",
      "/agency/get-started?sa=sa1",
    );
  });
});

describe("the auto-opened setup pop-up", () => {
  it("opens once, and once closed never re-opens on navigation", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SetupProgressPill />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(gate.dismissCalls).toBe(1);

    for (const page of ["/sa/sa1/contacts", "/sa/sa1/calendar", "/sa/sa1/forms", "/sa/sa1/dashboard"]) {
      nav.pathname = page;
      rerender(<SetupProgressPill />);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
  });

  it("does not open at all when the user dismissed it within the last 7 days", async () => {
    gate.dismissedAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
    render(<SetupProgressPill />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
