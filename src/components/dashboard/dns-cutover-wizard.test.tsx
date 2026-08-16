import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DnsCutoverWizard } from "./dns-cutover-wizard";
import type { DomainDnsSnapshot } from "@/lib/dns/records";

/**
 * The wizard has two routes, and picking the wrong one takes a domain off the
 * internet.
 *
 * A nameserver pair answers only for zones inside the account it was issued
 * to. If the deployment has no pair of its own and the wizard prints one
 * anyway, every agent who follows it delegates their domain to a zone that
 * does not exist: no A record, no MX, nothing. The site does not look broken,
 * it disappears, and so does their mail, until they revert and wait out
 * propagation. That is the exact liability these cover.
 *
 * So: no configured nameservers means no nameserver instructions, and the
 * agent is routed down the record-only path — which leaves authority over the
 * domain where it already is and cannot break email at all.
 */

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const SNAPSHOT: DomainDnsSnapshot = {
  domain: "example-realty.test",
  nameservers: ["ns01.domaincontrol.com", "ns02.domaincontrol.com"],
  records: [
    { kind: "MX", name: "@", value: "aspmx.l.google.com", priority: 1 },
    { kind: "TXT", name: "@", value: "v=spf1 include:_spf.google.com ~all" },
  ],
  checkedAt: "2026-08-16T12:00:00Z",
};

function mockLookup(snapshot: DomainDnsSnapshot = SNAPSHOT) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ snapshot }) }))
  );
}

async function renderWizard(props: { targetNameservers?: string[] } = {}) {
  render(<DnsCutoverWizard subAccountId="sub-1" {...props} />);
  await waitFor(() =>
    expect(
      screen.queryByText(/reading your domain/i)
    ).not.toBeInTheDocument()
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("with no nameservers configured — the default deployment", () => {
  it("never prints a nameserver for the agent to switch to", async () => {
    mockLookup();
    await renderWizard();

    // The literal that used to ship as a hard-coded fallback.
    expect(screen.queryByText(/kim\.ns\.cloudflare\.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/set your nameservers to/i)).not.toBeInTheDocument();
  });

  it("says in as many words that no nameserver change is needed", async () => {
    mockLookup();
    await renderWizard();

    expect(
      screen.getByText(/you do not need to change your nameservers/i)
    ).toBeInTheDocument();
    // And pre-empts the outdated guide that would tell them otherwise.
    expect(screen.getByText(/it is out of date/i)).toBeInTheDocument();
  });

  it("does not lock the agent behind an email step that guards nothing", async () => {
    // The domain stays at its current DNS host, so the mail records are never
    // at risk. Making the agent tick "I copied my MX records" here would be an
    // obstacle with no hazard behind it.
    mockLookup();
    await renderWizard();

    expect(screen.getByText(/your email is not affected/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/copy your email records/i)
    ).not.toBeInTheDocument();

    // The only thing still locked is the final check, which genuinely has
    // nothing to verify until the record has been added. The step that asks
    // for the record is reachable straight away.
    expect(screen.getAllByText("Locked")).toHaveLength(1);
    expect(
      screen.getByRole("checkbox", { name: /my website records are added/i })
    ).toBeEnabled();
  });

  it("unlocks the final check once the record is added, with no switch to wait for", async () => {
    mockLookup();
    await renderWizard();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /my website records are added/i })
    );

    expect(screen.queryByText("Locked")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /check my domain now/i })
    ).toBeEnabled();
  });

  it("drops the outage warning that only applies to a cutover", async () => {
    mockLookup();
    await renderWizard();

    expect(
      screen.queryByText(/read this before you change anything/i)
    ).not.toBeInTheDocument();
  });

  it("names the host the agent already uses, rather than a new one", async () => {
    mockLookup();
    await renderWizard();

    expect(screen.getAllByText(/GoDaddy/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/at your new DNS host\./)).not.toBeInTheDocument();
  });
});

describe("with a nameserver pair configured — a real cutover", () => {
  const TARGET = ["ns1.example-dns.com", "ns2.example-dns.com"];

  /** Satisfy the interlock so the nameserver step becomes visible. */
  async function clearInterlock() {
    await userEvent.click(
      screen.getByRole("checkbox", { name: /added every row above/i })
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /my website records are added/i })
    );
  }

  it("prints the configured pair and nothing invented", async () => {
    mockLookup();
    await renderWizard({ targetNameservers: TARGET });
    await clearInterlock();

    expect(screen.getByText(/set your nameservers to/i)).toBeInTheDocument();
    for (const ns of TARGET) {
      expect(screen.getByText(ns)).toBeInTheDocument();
    }
    expect(
      screen.queryByText(/kim\.ns\.cloudflare\.com/i)
    ).not.toBeInTheDocument();
  });

  it("keeps the email interlock, because mail can now break", async () => {
    mockLookup();
    await renderWizard({ targetNameservers: TARGET });

    expect(
      screen.getByText(/copy your email records to the new DNS host/i)
    ).toBeInTheDocument();
    // The website records, the switch itself, and the final check are all out
    // of reach until the mail records have been re-created — and because the
    // step body is not rendered while locked, the nameservers are not even
    // readable yet.
    expect(screen.getAllByText("Locked")).toHaveLength(3);
    expect(screen.queryByText(TARGET[0])).not.toBeInTheDocument();
    expect(
      screen.getByText(/read this before you change anything/i)
    ).toBeInTheDocument();
  });

  it("still shows the interlock copy naming what stays locked", async () => {
    mockLookup();
    await renderWizard({ targetNameservers: TARGET });

    expect(
      screen.getByText(/nameserver step stays locked until this is ticked/i)
    ).toBeInTheDocument();
  });
});
