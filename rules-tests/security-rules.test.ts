import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

/**
 * Exercises the real firestore.rules + storage.rules in the emulators.
 * Fixtures are invented (agency "ag1", workspace "sa1") — never real data.
 */
const PROJECT = "demo-agentstack-rules";
let env: RulesTestEnvironment;

const active = (extra: Record<string, unknown> = {}) => ({
  status: "active",
  agencyId: "ag1",
  agencyRole: null,
  ...extra,
});
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});
afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "subAccounts/sa1"), { agencyId: "ag1", name: "Test Realty" });
    await setDoc(doc(db, "subAccounts/sa1/subAccountMembers/admin1"), { status: "active", role: "admin" });
    await setDoc(doc(db, "subAccounts/sa1/subAccountMembers/collab1"), { status: "active", role: "collaborator" });
    await setDoc(doc(db, "subAccounts/sa1/secrets/twilio"), { authToken: "test-token" });
    await setDoc(doc(db, "reviewRequests/r1"), { agencyId: "ag1", subAccountId: "sa1", status: "queued" });
  });
});

describe("Firestore: integration secrets", () => {
  it("no member — not even an admin or the agency owner — can read the Twilio token", async () => {
    for (const [uid, claims] of [
      ["collab1", active()],
      ["admin1", active()],
      ["owner1", active({ agencyRole: "owner" })],
    ] as const) {
      const db = env.authenticatedContext(uid, claims).firestore();
      await assertFails(getDoc(doc(db, "subAccounts/sa1/secrets/twilio")));
    }
  });

  it("no client can write a secret", async () => {
    const db = env.authenticatedContext("admin1", active()).firestore();
    await assertFails(setDoc(doc(db, "subAccounts/sa1/secrets/twilio"), { authToken: "x" }));
  });
});

describe("Firestore: Review Requests log", () => {
  it("an active member of the workspace can read the log", async () => {
    const db = env.authenticatedContext("collab1", active()).firestore();
    await assertSucceeds(getDoc(doc(db, "reviewRequests/r1")));
  });

  it("an outsider cannot read it, and nobody can write it from the client", async () => {
    const outsider = env.authenticatedContext("stranger", active({ agencyId: "other" })).firestore();
    await assertFails(getDoc(doc(outsider, "reviewRequests/r1")));
    const admin = env.authenticatedContext("admin1", active()).firestore();
    await assertFails(setDoc(doc(admin, "reviewRequests/r2"), { agencyId: "ag1", subAccountId: "sa1" }));
  });
});

describe("Storage: community images", () => {
  const path = "community/sa1/g1/cover.png";

  it("a workspace admin can upload a PNG", async () => {
    const st = env.authenticatedContext("admin1", active()).storage();
    await assertSucceeds(uploadBytes(ref(st, path), PNG, { contentType: "image/png" }));
  });

  it("the agency owner can upload", async () => {
    const st = env.authenticatedContext("owner1", active({ agencyRole: "owner" })).storage();
    await assertSucceeds(uploadBytes(ref(st, path), PNG, { contentType: "image/png" }));
  });

  it("a collaborator (non-admin) cannot upload", async () => {
    const st = env.authenticatedContext("collab1", active()).storage();
    await assertFails(uploadBytes(ref(st, path), PNG, { contentType: "image/png" }));
  });

  it("a member of another workspace cannot upload", async () => {
    const st = env.authenticatedContext("stranger", active({ agencyId: "other" })).storage();
    await assertFails(uploadBytes(ref(st, path), PNG, { contentType: "image/png" }));
  });

  it("SVG and other disallowed types are rejected, even for an admin", async () => {
    const st = env.authenticatedContext("admin1", active()).storage();
    await assertFails(uploadBytes(ref(st, "community/sa1/g1/x.svg"), PNG, { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(st, "community/sa1/g1/x.html"), PNG, { contentType: "text/html" }));
  });

  it("anything outside community/ is denied", async () => {
    const st = env.authenticatedContext("admin1", active()).storage();
    await assertFails(uploadBytes(ref(st, "other/file.png"), PNG, { contentType: "image/png" }));
  });
});
