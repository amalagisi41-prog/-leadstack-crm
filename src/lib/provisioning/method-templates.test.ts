import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * THE REGRESSION THIS FILE EXISTS FOR
 * -----------------------------------
 * The four seeded Method Templates all execute by scheduling their first node
 * through QStash. Without QStash configured, the engine marks the run failed
 * and returns — but only after enrolling the contact and incrementing
 * `stats.enrolled`.
 *
 * Seeded as "active" on a deployment that cannot run them, the result was the
 * worst kind of failure: the workflow list says Active, the enrolled counter
 * climbs, and no lead is ever contacted. "Answer every new lead within 60
 * seconds" is this product's headline promise, and it was able to silently not
 * happen.
 *
 * If someone ever changes this back to an unconditional "active", these tests
 * fail.
 */

const qstashIsConfigured = vi.fn();

vi.mock("@/lib/automations/qstash", () => ({
  qstashIsConfigured: () => qstashIsConfigured(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" },
}));

const { seedMethodTemplates } = await import("./method-templates");

type Seeded = { id: string; status: string; pausedReason?: string | null };

/** Minimal stand-in for the Firestore handle the seeder writes through. */
function fakeDb() {
  let n = 0;
  return {
    collection: () => ({
      doc: () => ({ id: `wf_${++n}` }),
    }),
  } as never;
}

function seed(): Seeded[] {
  const written: Seeded[] = [];
  seedMethodTemplates(
    fakeDb(),
    (_ref, data) => written.push(data as unknown as Seeded),
    { agencyId: "ag_1", subAccountId: "sa_1", createdByUid: "uid_1" },
  );
  return written;
}

beforeEach(() => qstashIsConfigured.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("seedMethodTemplates", () => {
  it("seeds the templates ACTIVE when QStash can actually run them", () => {
    qstashIsConfigured.mockReturnValue(true);
    const written = seed();

    expect(written.length).toBeGreaterThan(0);
    for (const doc of written) {
      expect(doc.status).toBe("active");
      expect(doc.pausedReason).toBeNull();
    }
  });

  it("seeds them PAUSED when QStash is not configured", () => {
    qstashIsConfigured.mockReturnValue(false);
    const written = seed();

    expect(written.length).toBeGreaterThan(0);
    for (const doc of written) {
      // Never "active" on a deployment that cannot send. An enrolled lead
      // that is never contacted is worse than a workflow that is visibly off.
      expect(doc.status).toBe("paused");
    }
  });

  it("says WHY they are paused, so the state isn't a mystery", () => {
    qstashIsConfigured.mockReturnValue(false);
    for (const doc of seed()) {
      expect(doc.pausedReason).toBeTruthy();
      expect(doc.pausedReason).toMatch(/isn't configured|not configured/i);
    }
  });

  it("seeds every template either way — pausing must not drop workflows", () => {
    qstashIsConfigured.mockReturnValue(true);
    const withQstash = seed().length;
    qstashIsConfigured.mockReturnValue(false);
    const withoutQstash = seed().length;

    expect(withoutQstash).toBe(withQstash);
  });
});
