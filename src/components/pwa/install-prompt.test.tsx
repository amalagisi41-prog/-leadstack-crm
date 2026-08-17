import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallPrompt } from "./install-prompt";
import { InstallCallout } from "./install-callout";

/**
 * The install prompt has one job that is easy to get wrong invisibly: keep
 * asking until the app is actually installed, without becoming the thing
 * people dismiss unread.
 *
 * The bug this replaces shipped for months — the old banner wrote a permanent
 * "dismissed" flag on first sight, so a single stray tap retired the prompt
 * forever and most operators never learned the app existed. Nothing here may
 * silence it permanently except a real install.
 */

vi.mock("next/image", () => ({
  default: ({ ...props }: Record<string, unknown>) =>
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...(props as { alt?: string })} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** Pretend to be a given device, with a clean storage slate. */
function asDevice(
  userAgent: string,
  { platform = "Win32", maxTouchPoints = 0, standalone = false } = {}
) {
  vi.stubGlobal("navigator", {
    userAgent,
    platform,
    maxTouchPoints,
    ...(standalone ? { standalone: true } : {}),
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: standalone && query.includes("standalone"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Safari/604.1";

/** Fire the Chromium install offer the way the browser would. */
function offerNativeInstall() {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome: "accepted" as const });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  asDevice(CHROME_ANDROID);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the sign-in prompt", () => {
  it("interrupts a user who has never been asked", async () => {
    render(<InstallPrompt />);
    expect(
      await screen.findByText(/put agentstack on your phone/i)
    ).toBeInTheDocument();
  });

  it("does not interrupt twice in the same session", async () => {
    const first = render(<InstallPrompt />);
    await screen.findByText(/put agentstack on your phone/i);
    first.unmount();

    render(<InstallPrompt />);
    await waitFor(() =>
      expect(
        screen.queryByText(/put agentstack on your phone/i)
      ).not.toBeInTheDocument()
    );
  });

  it("comes back in a later session after being dismissed", async () => {
    const first = render(<InstallPrompt />);
    await userEvent.click(await screen.findByRole("button", { name: /remind me later/i }));
    first.unmount();

    // A new browser session, but the snooze is still running.
    sessionStorage.clear();
    const second = render(<InstallPrompt />);
    await waitFor(() =>
      expect(screen.queryByText(/put agentstack on your phone/i)).not.toBeInTheDocument()
    );
    second.unmount();

    // Once the snooze lapses it must return — dismissing is not a permanent
    // opt-out, which is exactly what the previous banner got wrong.
    sessionStorage.clear();
    localStorage.setItem(
      "agentstack:app-install-snoozed-until:v1",
      new Date(Date.now() - 1000).toISOString()
    );
    render(<InstallPrompt />);
    expect(
      await screen.findByText(/put agentstack on your phone/i)
    ).toBeInTheDocument();
  });

  it("stays away once the app is genuinely installed", async () => {
    localStorage.setItem("agentstack:app-installed:v1", "1");
    render(<InstallPrompt />);
    await waitFor(() =>
      expect(
        screen.queryByText(/put agentstack on your phone/i)
      ).not.toBeInTheDocument()
    );
  });

  it("says nothing when already running as the installed app", async () => {
    asDevice(CHROME_ANDROID, { standalone: true });
    render(<InstallPrompt />);
    await waitFor(() =>
      expect(
        screen.queryByText(/put agentstack on your phone/i)
      ).not.toBeInTheDocument()
    );
  });
});

describe("platforms with no install button", () => {
  it("gives an iPhone the Share-sheet steps, not a button it will never get", async () => {
    asDevice(IPHONE_SAFARI, { platform: "iPhone", maxTouchPoints: 5 });
    render(<InstallPrompt />);

    await screen.findByText(/put agentstack on your phone/i);
    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^install agentstack$/i })
    ).not.toBeInTheDocument();
  });

  it("lets an iPhone user self-report, the only signal iOS ever gives", async () => {
    asDevice(IPHONE_SAFARI, { platform: "iPhone", maxTouchPoints: 5 });
    const view = render(<InstallPrompt />);

    await userEvent.click(
      await screen.findByRole("button", { name: /added it/i })
    );
    view.unmount();

    sessionStorage.clear();
    render(<InstallPrompt />);
    await waitFor(() =>
      expect(
        screen.queryByText(/put agentstack on your phone/i)
      ).not.toBeInTheDocument()
    );
  });
});

describe("the native install path", () => {
  it("offers a real install button once the browser allows it", async () => {
    render(<InstallPrompt />);
    await screen.findByText(/put agentstack on your phone/i);

    offerNativeInstall();

    expect(
      await screen.findByRole("button", { name: /install agentstack/i })
    ).toBeInTheDocument();
  });

  it("stops prompting after the browser reports a completed install", async () => {
    const view = render(<InstallPrompt />);
    await screen.findByText(/put agentstack on your phone/i);

    window.dispatchEvent(new Event("appinstalled"));
    view.unmount();

    sessionStorage.clear();
    render(<InstallPrompt />);
    await waitFor(() =>
      expect(
        screen.queryByText(/put agentstack on your phone/i)
      ).not.toBeInTheDocument()
    );
  });
});

describe("the sidebar callout", () => {
  it("offers a way back for anyone who skipped the prompt", async () => {
    render(<InstallCallout />);
    const link = await screen.findByRole("link", { name: /get the app/i });
    expect(link).toHaveAttribute("href", "/download");
  });

  it("survives a dismissal — skipping is not opting out", async () => {
    const prompt = render(<InstallPrompt />);
    await userEvent.click(
      await screen.findByRole("button", { name: /remind me later/i })
    );
    prompt.unmount();

    render(<InstallCallout />);
    expect(
      await screen.findByRole("link", { name: /get the app/i })
    ).toBeInTheDocument();
  });

  it("disappears once the app is installed", async () => {
    localStorage.setItem("agentstack:app-installed:v1", "1");
    render(<InstallCallout />);
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /get the app/i })
      ).not.toBeInTheDocument()
    );
  });
});
