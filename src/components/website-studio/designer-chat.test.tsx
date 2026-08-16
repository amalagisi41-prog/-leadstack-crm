import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesignerChat } from "./designer-chat";
import type { DesignerTurn } from "@/types/agent-site";

/**
 * The Vibe Builder composer, where an agent pastes design work produced in
 * Claude or ChatGPT. Every test here guards against a *silent* failure — a
 * paste that looks accepted but was truncated, dropped, or applied without
 * the user being told what happened.
 */

const TRANSCRIPT: DesignerTurn[] = [
  { role: "agent", content: "Make the hero darker" },
  { role: "designer", content: "Done — the hero background is now navy." },
];

const VIBE_PLACEHOLDER = /paste CSS or a design spec from Claude\/ChatGPT/i;

function mockFetchOnce(body: Record<string, unknown>, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderVibe(
  overrides: Partial<Parameters<typeof DesignerChat>[0]> = {}
) {
  return render(
    <DesignerChat
      subAccountId="sub-1"
      brandName="AgentStack"
      initialTranscript={TRANSCRIPT}
      initialStep={0}
      totalSteps={10}
      onContent={() => {}}
      onDesign={() => {}}
      experience="vibe"
      {...overrides}
    />
  );
}

/** Body of the nth fetch call, parsed. */
function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("Vibe composer — pasting from Claude or ChatGPT", () => {
  it("sends a multi-line paste in full, with no truncation", async () => {
    const fetchMock = mockFetchOnce({ reply: "Applied." });
    renderVibe();

    // Comfortably past the old 1500-character single-line cap.
    const css = ".hero { letter-spacing: 2px; }\n".repeat(200);
    const composer = screen.getByPlaceholderText(VIBE_PLACEHOLDER);
    fireEvent.change(composer, { target: { value: css } });
    fireEvent.submit(composer.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody(fetchMock).message).toHaveLength(css.trim().length);
    expect(sentBody(fetchMock).message).toBe(css.trim());
  });

  it("has no maxLength that could clip a paste without saying so", () => {
    renderVibe();
    const composer = screen.getByPlaceholderText(VIBE_PLACEHOLDER);
    expect(composer).not.toHaveAttribute("maxLength");
  });

  it("keeps the short cap on the guided interview", () => {
    render(
      <DesignerChat
        subAccountId="sub-1"
        brandName="AgentStack"
        initialTranscript={TRANSCRIPT}
        initialStep={2}
        totalSteps={10}
        onContent={() => {}}
        experience="guided"
      />
    );
    expect(screen.getByPlaceholderText(/type your answer/i)).toHaveAttribute(
      "maxLength",
      "1500"
    );
  });

  it("refuses an over-long message with the actual count instead of clipping", async () => {
    const fetchMock = mockFetchOnce({ reply: "Applied." });
    renderVibe();

    const composer = screen.getByPlaceholderText(VIBE_PLACEHOLDER);
    fireEvent.change(composer, { target: { value: "a".repeat(24_001) } });
    fireEvent.submit(composer.closest("form")!);

    expect(await screen.findByText(/24,001 characters/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    // The message must survive so it can be trimmed, not retyped.
    expect(composer).toHaveValue("a".repeat(24_001));
  });
});

describe("Vibe composer — telling the user what a paste will do", () => {
  it("counts the CSS rules that will be applied verbatim", async () => {
    renderVibe();
    fireEvent.change(screen.getByPlaceholderText(VIBE_PLACEHOLDER), {
      target: { value: ".a { color: red }\n.b { color: blue }" },
    });

    expect(
      await screen.findByText(/2 CSS rules will be applied verbatim/i)
    ).toBeInTheDocument();
  });

  it("names the design tokens lifted from a pasted palette", async () => {
    renderVibe();
    fireEvent.change(screen.getByPlaceholderText(VIBE_PLACEHOLDER), {
      target: { value: '{ "accent": "#c9a227", "radius": 12 }' },
    });

    expect(
      await screen.findByText(/design tokens: accent, radius/i)
    ).toBeInTheDocument();
  });

  it("warns that markup cannot run rather than implying it will", async () => {
    renderVibe();
    fireEvent.change(screen.getByPlaceholderText(VIBE_PLACEHOLDER), {
      target: { value: "```html\n<section><h1>Hi</h1></section>\n```" },
    });

    expect(await screen.findByText(/can’t run here/i)).toBeInTheDocument();
  });

  it("flags CSS that would be rejected before it is sent", async () => {
    renderVibe();
    fireEvent.change(screen.getByPlaceholderText(VIBE_PLACEHOLDER), {
      target: {
        value:
          '```css\n@import url("https://x.example/a.css");\nh1 { color: red }\n```',
      },
    });

    expect(await screen.findByText(/uses @import/i)).toBeInTheDocument();
  });

  it("shows no code notice for an ordinary request", () => {
    renderVibe();
    fireEvent.change(screen.getByPlaceholderText(VIBE_PLACEHOLDER), {
      target: { value: "Make the hero blue and round the buttons" },
    });

    expect(screen.queryByText(/applied verbatim/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/can’t run here/i)).not.toBeInTheDocument();
  });
});

describe("Vibe composer — interaction", () => {
  it("warns about obsolete builder replies and resets only the conversation", async () => {
    const fetchMock = mockFetchOnce({ site: {} });
    renderVibe({
      initialTranscript: [
        {
          role: "designer",
          content: "Colors and fonts are controlled by your template.",
        },
      ],
    });

    expect(
      screen.getByText(/replies from the previous builder/i)
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /reset chat/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody(fetchMock)).toEqual({
      designerTranscript: [],
      designerStep: 0,
    });
    expect(
      screen.queryByText(/replies from the previous builder/i)
    ).not.toBeInTheDocument();
  });

  it("sends on Enter and adds a newline on Shift+Enter", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchOnce({ reply: "Applied." });
    renderVibe();

    const composer = screen.getByPlaceholderText(VIBE_PLACEHOLDER);
    await user.click(composer);
    await user.keyboard("first{Shift>}{Enter}{/Shift}second");
    expect(composer).toHaveValue("first\nsecond");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody(fetchMock).message).toBe("first\nsecond");
  });

  it("restores the message and rolls back the echo when the request fails", async () => {
    const fetchMock = mockFetchOnce(
      { error: "The Designer had trouble." },
      false
    );
    renderVibe();

    const composer = screen.getByPlaceholderText(VIBE_PLACEHOLDER);
    const paste = ".hero { color: #123456 }";
    fireEvent.change(composer, { target: { value: paste } });
    fireEvent.submit(composer.closest("form")!);

    expect(
      await screen.findByText("The Designer had trouble.")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    // Retyping a pasted stylesheet after a failed request is not acceptable.
    await waitFor(() => expect(composer).toHaveValue(paste));
    // The optimistic echo of the failed turn is withdrawn from the
    // transcript. `ignore` keeps the composer's own restored value — which is
    // the same string — from matching here.
    expect(screen.queryAllByText(paste, { ignore: "textarea" })).toHaveLength(
      0
    );
  });

  it("applies content and design updates returned by the server", async () => {
    const onContent = vi.fn();
    const onDesign = vi.fn();
    mockFetchOnce({
      reply: "Applied your stylesheet.",
      content: { agentName: "Franco" },
      design: { accent: "#c9a227" },
    });
    renderVibe({ onContent, onDesign });

    const composer = screen.getByPlaceholderText(VIBE_PLACEHOLDER);
    fireEvent.change(composer, { target: { value: ".a { color: red }" } });
    fireEvent.submit(composer.closest("form")!);

    await waitFor(() => expect(onContent).toHaveBeenCalled());
    expect(onDesign).toHaveBeenCalledWith({ accent: "#c9a227" });
    expect(
      await screen.findByText("Applied your stylesheet.")
    ).toBeInTheDocument();
  });

  it("sends a suggestion pill as the next message", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchOnce({
      reply: "Done.",
      suggestions: ["Tighten the spacing between sections"],
    });
    renderVibe();

    const composer = screen.getByPlaceholderText(VIBE_PLACEHOLDER);
    fireEvent.change(composer, { target: { value: "Darken the hero" } });
    fireEvent.submit(composer.closest("form")!);

    const pill = await screen.findByRole("button", {
      name: "Tighten the spacing between sections",
    });
    await user.click(pill);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sentBody(fetchMock, 1).message).toBe(
      "Tighten the spacing between sections"
    );
  });

  it("marks the request as vibe mode so the server opens the paste limit", async () => {
    const fetchMock = mockFetchOnce({ reply: "ok" });
    renderVibe();

    const composer = screen.getByPlaceholderText(VIBE_PLACEHOLDER);
    fireEvent.change(composer, { target: { value: "Darken the hero" } });
    fireEvent.submit(composer.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody(fetchMock).mode).toBe("vibe");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/sub-accounts/sub-1/agent-site/designer"
    );
  });

  it("auto-starts by loading the blueprint when there is no transcript", async () => {
    const fetchMock = mockFetchOnce({ reply: "Here's what I know." });
    renderVibe({ initialTranscript: [] });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody(fetchMock).message).toMatch(/Business Blueprint/i);
  });
});
