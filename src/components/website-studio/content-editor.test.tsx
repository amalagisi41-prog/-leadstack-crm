import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContentEditor } from "./content-editor";
import {
  emptyAgentSiteContent,
  type AgentSiteContent,
} from "@/types/agent-site";

/**
 * Regression cover for "Application error: a client-side exception has
 * occurred", which took down the whole Website Studio client in production.
 *
 * A site document written before a field existed comes back from Firestore
 * without it. The editor rendered `content.metaTitle.length` and threw. The
 * unit test in types/agent-site.test.ts proves the normalizer fills the gap;
 * these prove the component actually calls it, which is the part that was
 * missing when the crash shipped.
 */

function renderEditor(content: Partial<AgentSiteContent>, revealGroup?: string) {
  return render(
    <ContentEditor
      content={content as AgentSiteContent}
      onChange={vi.fn()}
      onSave={vi.fn().mockResolvedValue(undefined)}
      saving={false}
      revealGroup={revealGroup}
    />
  );
}

describe("ContentEditor — surviving legacy documents", () => {
  it("renders a document written before the SEO fields existed", () => {
    // Exactly the shape that crashed the client.
    const legacy = {
      agentName: "Franco Malagisi",
      tagline: "Personal connections. Professional results.",
    };

    expect(() => renderEditor(legacy)).not.toThrow();
    expect(screen.getByDisplayValue("Franco Malagisi")).toBeInTheDocument();
  });

  it("renders when array fields are missing or explicitly null", () => {
    const broken = {
      agentName: "Franco Malagisi",
      specialties: null,
      listings: undefined,
      testimonials: null,
      galleryUrls: null,
    } as unknown as Partial<AgentSiteContent>;

    expect(() => renderEditor(broken)).not.toThrow();
  });

  it("renders when the compliance object is partial", () => {
    const partial = {
      agentName: "Franco Malagisi",
      compliance: { licenseNumber: "RES.0800123" },
    } as unknown as Partial<AgentSiteContent>;

    expect(() => renderEditor(partial)).not.toThrow();
    expect(screen.getByDisplayValue("RES.0800123")).toBeInTheDocument();
  });

  it("renders an entirely empty document", () => {
    expect(() => renderEditor({})).not.toThrow();
  });

  it("keeps every stored value it was handed", () => {
    renderEditor({
      ...emptyAgentSiteContent(),
      agentName: "Jane Doe",
      brokerage: "Coastal Realty",
      metaTitle: "Jane Doe | Fairfield County Realtor",
    });

    expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Coastal Realty")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Jane Doe | Fairfield County Realtor")
    ).toBeInTheDocument();
  });
});

describe("ContentEditor — the 'Fix details' landing", () => {
  it("gives each group an anchor the publish checklist can scroll to", () => {
    const { container } = renderEditor(emptyAgentSiteContent());

    // Without these ids the checklist's "Fix details" button flipped to a
    // tab 200+ lines off-screen and read as doing nothing at all.
    expect(container.querySelectorAll("[id^='content-group-']").length).
      toBeGreaterThan(0);
  });

  it("scrolls the requested group into view", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderEditor(emptyAgentSiteContent(), "Real estate compliance");

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" })
    );
  });

  it("does not scroll when no group was requested", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderEditor(emptyAgentSiteContent());

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("ContentEditor — accessibility", () => {
  it("names every field control via its label", () => {
    renderEditor(emptyAgentSiteContent());

    // These were visually adjacent but not associated, so a screen reader
    // announced an unnamed text box — and several have no placeholder to
    // fall back on either.
    expect(screen.getByLabelText("Agent name")).toBeInTheDocument();
    expect(screen.getByLabelText("Brokerage")).toBeInTheDocument();
    expect(screen.getByLabelText("Logo URL")).toBeInTheDocument();
  });

  it("focuses the input when its label is clicked", async () => {
    renderEditor(emptyAgentSiteContent());

    await userEvent.click(screen.getByText("Brokerage"));
    expect(screen.getByLabelText("Brokerage")).toHaveFocus();
  });
});

describe("ContentEditor — editing", () => {
  it("saves the edited draft", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ContentEditor
        content={emptyAgentSiteContent()}
        onChange={vi.fn()}
        onSave={onSave}
        saving={false}
      />
    );

    await userEvent.type(screen.getByLabelText("Agent name"), "Franco");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: "Franco" })
    );
  });
});
