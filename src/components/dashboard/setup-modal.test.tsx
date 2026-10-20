import { describe, expect, it } from "vitest";
import { deriveSetupStepStates } from "./setup-modal";

const noneDone = {
  identity: false,
  communications: false,
  listings: false,
  social: false,
  payments: false,
  domain: false,
};

describe("deriveSetupStepStates", () => {
  it("only unlocks step 1 when nothing is done", () => {
    const states = deriveSetupStepStates(noneDone, []);
    expect(states.identity).toBe("active");
    expect(states.communications).toBe("locked");
    expect(states.listings).toBe("locked");
    expect(states.social).toBe("locked");
    expect(states.payments).toBe("locked");
    expect(states.domain).toBe("locked");
  });

  it("unlocks communications once identity is done, but not listings/social yet", () => {
    const states = deriveSetupStepStates(
      { ...noneDone, identity: true },
      []
    );
    expect(states.identity).toBe("done");
    expect(states.communications).toBe("active");
    expect(states.listings).toBe("locked");
    expect(states.social).toBe("locked");
  });

  it("unlocks listings and social once communications succeeds — never before, per the doc's own spec", () => {
    const states = deriveSetupStepStates(
      { ...noneDone, identity: true, communications: true },
      []
    );
    expect(states.communications).toBe("done");
    expect(states.listings).toBe("active");
    expect(states.social).toBe("active");
    expect(states.payments).toBe("locked");
    expect(states.domain).toBe("locked");
  });

  it("requires BOTH listings and social to be done-or-skipped before payments/domain unlock", () => {
    const onlyListingsDone = deriveSetupStepStates(
      { ...noneDone, identity: true, communications: true, listings: true },
      []
    );
    expect(onlyListingsDone.payments).toBe("locked");
    expect(onlyListingsDone.domain).toBe("locked");

    const listingsDoneSocialSkipped = deriveSetupStepStates(
      { ...noneDone, identity: true, communications: true, listings: true },
      ["social"]
    );
    expect(listingsDoneSocialSkipped.social).toBe("done");
    expect(listingsDoneSocialSkipped.payments).toBe("active");
    expect(listingsDoneSocialSkipped.domain).toBe("active");
  });

  it("treats a skip as done for lock purposes without marking the underlying signal true", () => {
    const states = deriveSetupStepStates(
      { ...noneDone, identity: true, communications: true },
      ["listings", "social"]
    );
    expect(states.listings).toBe("done");
    expect(states.social).toBe("done");
    expect(states.payments).toBe("active");
  });

  it("reports every step done once all six are done or skipped", () => {
    const states = deriveSetupStepStates(
      {
        identity: true,
        communications: true,
        listings: true,
        social: true,
        payments: false,
        domain: false,
      },
      ["payments", "domain"]
    );
    expect(Object.values(states).every((s) => s === "done")).toBe(true);
  });

  it("identity and communications are never satisfied by a skip — they aren't in the skippable set the API accepts", () => {
    const states = deriveSetupStepStates(noneDone, ["identity", "communications"]);
    // Skipping an unrecognised-for-skip id has no special meaning here (the
    // API route rejects it before it ever reaches this function) — this
    // guards that the pure function doesn't accidentally honour it either.
    expect(states.identity).toBe("active");
    expect(states.communications).toBe("locked");
  });
});
