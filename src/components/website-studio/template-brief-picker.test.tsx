import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateBriefPicker } from "./template-brief-picker";
import type { CapabilityInputs } from "@/lib/website-studio/prompt-library/capabilities";

/**
 * What the agent is told before a generation runs.
 *
 * The whole feature turns on this screen being honest in advance. Generating
 * first and discovering the empty listings grid afterwards is worse than a
 * blank page: the run has been paid for, and the page looks finished enough to
 * publish with a hole in it.
 */

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const saPath = (p: string) => `/sa/sub-1${p}`;

const READY: CapabilityInputs = {
  profileCompleteness: 90,
  idxEnabled: true,
  idxConfigured: true,
  reviewCount: 8,
  webChatEnabled: true,
  aiAgentConfigured: true,
};

const PROFILE_ONLY: CapabilityInputs = {
  profileCompleteness: 75,
  idxEnabled: false,
  idxConfigured: false,
  reviewCount: 0,
  webChatEnabled: false,
  aiAgentConfigured: false,
};

const EMPTY: CapabilityInputs = { ...PROFILE_ONLY, profileCompleteness: 5 };

function renderPicker(capabilities: CapabilityInputs) {
  const onUseBrief = vi.fn();
  render(
    <TemplateBriefPicker
      capabilities={capabilities}
      saPath={saPath}
      onUseBrief={onUseBrief}
    />
  );
  return { onUseBrief };
}

describe("when everything is connected", () => {
  it("offers the build with no warnings attached", async () => {
    const { onUseBrief } = renderPicker(READY);

    const button = screen.getByRole("button", { name: /build this site/i });
    expect(button).toBeEnabled();

    await userEvent.click(button);
    const [brief, name] = onUseBrief.mock.calls[0];
    expect(name).toMatch(/new agent/i);
    expect(String(brief).length).toBeGreaterThan(200);
  });
});

describe("when a section cannot be filled", () => {
  it("says so before the run, not after", async () => {
    renderPicker(PROFILE_ONLY);

    expect(screen.getByText(/live listings feed/i)).toBeInTheDocument();
    expect(screen.getByText(/no feed is connected|not enabled/i)).toBeInTheDocument();
    // Named, so the agent knows what they are giving up. Two sections drop
    // here — listings and testimonials — and both must be called out.
    expect(
      screen.getAllByText(/section will\s+be left out/i)
    ).toHaveLength(2);
  });

  it("offers a way to fix it that lands on a real page", () => {
    renderPicker(PROFILE_ONLY);
    // base-ui's Button renders its `render` element with role="button",
    // which overrides the anchor's implicit link role — so this is queried
    // as a button and checked for the href it actually navigates to.
    const link = screen.getByRole("button", { name: /see idx/i });
    expect(link).toHaveAttribute("href", "/sa/sub-1/idx");
  });

  it("still lets them build, and labels the trade-off honestly", async () => {
    const { onUseBrief } = renderPicker(PROFILE_ONLY);

    const button = screen.getByRole("button", {
      name: /build without the missing parts/i,
    });
    await userEvent.click(button);

    // The brief handed over must carry the prohibition, or the model fills
    // the gap it notices with invented listings.
    const [brief] = onUseBrief.mock.calls[0];
    expect(String(brief)).toMatch(/Do not build, reference, or leave a placeholder/);
  });
});

describe("when there is nothing to write from", () => {
  it("refuses rather than generating filler with their name on it", async () => {
    const { onUseBrief } = renderPicker(EMPTY);

    const button = screen.getByRole("button", { name: /add your details first/i });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onUseBrief).not.toHaveBeenCalled();
  });

  it("explains why, and where to go", () => {
    renderPicker(EMPTY);
    expect(
      screen.getAllByText(/reads like a template/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /fill this in/i })
    ).toHaveAttribute("href", "/sa/sub-1/business-profile");
  });
});
