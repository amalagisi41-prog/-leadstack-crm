import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SampleDataNotice, ShowExampleButton } from "./sample-data-notice";

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("SampleDataNotice", () => {
  it("renders nothing when no sample records are on screen", () => {
    const { container } = render(
      <SampleDataNotice
        subAccountId="sub-1"
        count={0}
        noun="people"
        canRemove
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names the count and the noun the screen is showing", () => {
    render(
      <SampleDataNotice
        subAccountId="sub-1"
        count={5}
        noun="people"
        canRemove
      />
    );
    expect(screen.getByText(/5 of these people are a sample/i)).toBeTruthy();
  });

  it("offers no remove button to a non-admin, and says who can", () => {
    render(
      <SampleDataNotice
        subAccountId="sub-1"
        count={5}
        noun="deals"
        canRemove={false}
      />
    );
    expect(screen.queryByRole("button", { name: /remove sample data/i })).toBe(
      null
    );
    expect(screen.getByText(/an admin on this workspace/i)).toBeTruthy();
  });

  it("confirms before deleting, and does not call the API on cancel", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SampleDataNotice
        subAccountId="sub-1"
        count={5}
        noun="people"
        canRemove
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: /remove sample data/i })
    );
    expect(screen.getByText(/remove the sample data\?/i)).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: /keep it for now/i })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DELETEs the sample-data route once confirmed", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        removed: { contacts: 5, deals: 5, conversations: 1 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SampleDataNotice
        subAccountId="sub-1"
        count={5}
        noun="people"
        canRemove
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: /remove sample data/i })
    );
    // The confirm dialog's button carries the same label as the trigger, so
    // take the last one — the one inside the dialog.
    const confirmButtons = screen.getAllByRole("button", {
      name: /remove sample data/i,
    });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string },
    ];
    expect(url).toBe("/api/sub-accounts/sub-1/sample-data");
    expect(init.method).toBe("DELETE");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("surfaces the server's message on failure and keeps the notice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "Only an admin can do that." }),
      }))
    );

    render(
      <SampleDataNotice
        subAccountId="sub-1"
        count={5}
        noun="people"
        canRemove
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: /remove sample data/i })
    );
    const confirmButtons = screen.getAllByRole("button", {
      name: /remove sample data/i,
    });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Only an admin can do that.")
    );
    // Still on screen: a failed removal must not read as a successful one.
    expect(screen.getByText(/5 of these people are a sample/i)).toBeTruthy();
  });
});

describe("ShowExampleButton", () => {
  it("renders nothing for someone who cannot seed", () => {
    const { container } = render(
      <ShowExampleButton subAccountId="sub-1" canSeed={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("POSTs the sample-data route", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        seeded: { contacts: 5, deals: 5, conversations: 1 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ShowExampleButton subAccountId="sub-1" canSeed />);
    await userEvent.click(
      screen.getByRole("button", { name: /show me an example/i })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string },
    ];
    expect(url).toBe("/api/sub-accounts/sub-1/sample-data");
    expect(init.method).toBe("POST");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("surfaces the already-seeded refusal rather than claiming success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: "This workspace already has the example in it.",
        }),
      }))
    );

    render(<ShowExampleButton subAccountId="sub-1" canSeed />);
    await userEvent.click(
      screen.getByRole("button", { name: /show me an example/i })
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "This workspace already has the example in it."
      )
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
