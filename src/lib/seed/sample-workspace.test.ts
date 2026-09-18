import { describe, expect, it } from "vitest";
import {
  deriveStepCompletion,
  EMPTY_ONBOARDING_SIGNALS,
} from "@/lib/onboarding/completion";

/**
 * The example every new workspace is given must never read as the client's own
 * work. `read-signals.ts` enforces that by subtracting sample records from its
 * counts; these lock the contract that depends on it.
 *
 * The seeder itself needs a live Firestore, so what is pinned here is the rule
 * the seeder exists to respect: a workspace holding nothing but the example
 * still has zero of its own contacts and deals, and says so.
 */
describe("sample data never counts as the client's work", () => {
  it("leaves a workspace holding only the example reporting nothing done", () => {
    // What `readOnboardingSignals` produces for a fresh workspace: the sample
    // rows exist, but `ownCountOf` subtracted them, so the counts are zero.
    const steps = new Map(
      deriveStepCompletion(EMPTY_ONBOARDING_SIGNALS).map((s) => [s.id, s])
    );
    expect(steps.get("contacts")!.done).toBe(false);
    expect(steps.get("contacts")!.missing).toBe("No contacts imported yet");
    expect(steps.get("pipeline")!.done).toBe(false);
    expect(steps.get("pipeline")!.missing).toBe(
      "No deals in your pipeline yet"
    );
  });

  it("flips only once the client adds something of their own", () => {
    // One real contact on top of the sample rows — `contactCount` counts the
    // client's, so this is 1, not 1 + the sample five.
    const steps = new Map(
      deriveStepCompletion({
        ...EMPTY_ONBOARDING_SIGNALS,
        contactCount: 1,
      }).map((s) => [s.id, s])
    );
    expect(steps.get("contacts")!.evidence).toBe("verified");
    // The example's five deals still do not count for the client.
    expect(steps.get("pipeline")!.done).toBe(false);
  });
});

describe("sample contact data is unmistakably fake", () => {
  it("routes every address to a domain that cannot receive mail", async () => {
    // RFC 2606 reserves example.com precisely so documentation samples can
    // never reach a real person. A sample lead an agent might actually email
    // or call is the failure this guards.
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/seed/sample-workspace.ts", "utf8")
    );
    const emails = [...source.matchAll(/"([^"@]+@[^"]+)"/g)].map((m) => m[1]);
    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) {
      expect(email, email).toMatch(/@example\.com$/);
    }
  });

  it("labels every name and deal title visibly", async () => {
    // The marker keeps it out of the counts, but a client reads the screen,
    // not the database. The visible prefix is what stops an agent mistaking a
    // sample for a lead worth calling.
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/seed/sample-workspace.ts", "utf8")
    );
    const labels = [...source.matchAll(/(?:name|dealTitle): "([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(labels.length).toBeGreaterThanOrEqual(10);
    for (const label of labels) {
      expect(label, label).toMatch(/^Sample — /);
    }
  });
});
