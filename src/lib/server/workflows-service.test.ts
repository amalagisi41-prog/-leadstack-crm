import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * THE REGRESSION THIS FILE EXISTS FOR
 * -----------------------------------
 * `pausedReason` explains a SYSTEM pause — the provisioning seeder writes it
 * when QStash isn't configured, so the workflows list can say "not running,
 * here's why" instead of showing an unexplained badge.
 *
 * It has to be cleared the moment the workflow leaves the paused state.
 * Otherwise the reason outlives the condition that caused it: the operator
 * turns the workflow on, later pauses it by hand for their own reasons, and
 * the list confidently tells them the deployment isn't configured — a claim
 * that is both false and unactionable.
 */

const update = vi.fn();
const get = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    doc: () => ({ get, update }),
    collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TS" },
}));

import { updateWorkflowServerSide } from "./workflows-service";

beforeEach(() => {
  update.mockReset();
  get.mockReset();
  get.mockResolvedValue({
    exists: true,
    data: () => ({ subAccountId: "sub-1" }),
  });
});

async function patchStatus(status: "active" | "paused" | "draft") {
  await updateWorkflowServerSide({
    subAccountId: "sub-1",
    workflowId: "wf-1",
    patch: { status },
  });
  return update.mock.calls[0][0] as Record<string, unknown>;
}

describe("updateWorkflowServerSide — pausedReason lifecycle", () => {
  it("clears the reason when the operator turns a workflow on", async () => {
    const write = await patchStatus("active");
    expect(write.status).toBe("active");
    expect(write.pausedReason).toBeNull();
  });

  it("clears the reason when a workflow is moved back to draft", async () => {
    const write = await patchStatus("draft");
    expect(write.pausedReason).toBeNull();
  });

  it("leaves the reason alone when the workflow stays paused", async () => {
    // An operator pausing by hand must not wipe a system explanation that is
    // still true — and re-writing it here would also mean re-deciding, in the
    // patch path, something only the seeder knows.
    const write = await patchStatus("paused");
    expect(write.status).toBe("paused");
    expect(write).not.toHaveProperty("pausedReason");
  });

  it("does not touch the reason on an unrelated edit", async () => {
    await updateWorkflowServerSide({
      subAccountId: "sub-1",
      workflowId: "wf-1",
      patch: { name: "Renamed" },
    });
    const write = update.mock.calls[0][0] as Record<string, unknown>;
    expect(write.name).toBe("Renamed");
    expect(write).not.toHaveProperty("pausedReason");
  });

  it("refuses to write across sub-account boundaries", async () => {
    get.mockResolvedValue({
      exists: true,
      data: () => ({ subAccountId: "someone-else" }),
    });
    const ok = await updateWorkflowServerSide({
      subAccountId: "sub-1",
      workflowId: "wf-1",
      patch: { status: "active" },
    });
    expect(ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
