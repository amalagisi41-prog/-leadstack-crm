import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  WorkflowDoc,
  WorkflowNode,
  WorkflowRunDoc,
  WorkflowRunStatus,
  WorkflowStatus,
  WorkflowTrigger,
} from "@/types/workflows";

/** Admin-SDK CRUD for the Workflow Builder. All reads/writes are sub-account
 *  scoped — every helper re-checks the doc's `subAccountId`. */

function toMillis(v: unknown): number {
  const m = v as { toMillis?: () => number } | null;
  return m && typeof m.toMillis === "function" ? m.toMillis() : 0;
}

export async function listWorkflows(subAccountId: string): Promise<WorkflowDoc[]> {
  const snap = await getAdminDb()
    .collection("workflows")
    .where("subAccountId", "==", subAccountId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<WorkflowDoc, "id">) }))
    .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
}

export async function getWorkflow(
  subAccountId: string,
  workflowId: string,
): Promise<WorkflowDoc | null> {
  const snap = await getAdminDb().doc(`workflows/${workflowId}`).get();
  if (!snap.exists) return null;
  const wf = { id: snap.id, ...(snap.data() as Omit<WorkflowDoc, "id">) };
  return wf.subAccountId === subAccountId ? wf : null;
}

export type WorkflowTemplate = "blank" | "speed-to-lead";

/** The Speed-to-Lead starter, rebuilt on the new engine (replaces the legacy
 *  recipe): form submit → instant SMS + email to the lead → notify the team. */
function speedToLeadSeed(): Pick<
  WorkflowDoc,
  "trigger" | "nodes" | "startNodeId"
> {
  const nodes: Record<string, WorkflowNode> = {
    n1: {
      id: "n1",
      type: "send_sms",
      config: {
        body: "Hi {{contact.firstName}}, thanks for reaching out — we got your message and will be in touch shortly.",
      },
      next: "n2",
    },
    n2: {
      id: "n2",
      type: "send_email",
      config: {
        subject: "Thanks for reaching out",
        body: "Hi {{contact.firstName}},\n\nThanks for getting in touch. A member of our team will follow up shortly.\n\n{{unsubscribeLink}}",
      },
      next: "n3",
    },
    n3: {
      id: "n3",
      type: "notify",
      config: {
        to: "",
        subject: "New lead from your form",
        body: "{{contact.name}} ({{contact.email}} · {{contact.phone}}) just submitted a form.",
      },
      next: null,
    },
  };
  return {
    trigger: { type: "form.submitted", filters: { all: [] } },
    nodes,
    startNodeId: "n1",
  };
}

export async function createWorkflowServerSide(opts: {
  subAccountId: string;
  createdByUid: string;
  name: string;
  template?: WorkflowTemplate;
}): Promise<string> {
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";

  const seed =
    opts.template === "speed-to-lead"
      ? speedToLeadSeed()
      : {
          trigger: { type: "form.submitted" as const, filters: { all: [] } },
          nodes: {},
          startNodeId: null,
        };

  const ref = db.collection("workflows").doc();
  const doc: Omit<WorkflowDoc, "id"> = {
    subAccountId: opts.subAccountId,
    agencyId,
    createdByUid: opts.createdByUid,
    name: opts.name.trim() || "Untitled workflow",
    status: "draft",
    trigger: seed.trigger,
    startNodeId: seed.startNodeId,
    nodes: seed.nodes,
    stats: { enrolled: 0, completed: 0 },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set({ id: ref.id, ...doc });
  return ref.id;
}

export interface WorkflowPatch {
  name?: string;
  status?: WorkflowStatus;
  trigger?: WorkflowTrigger;
  nodes?: Record<string, WorkflowNode>;
  startNodeId?: string | null;
}

export async function updateWorkflowServerSide(opts: {
  subAccountId: string;
  workflowId: string;
  patch: WorkflowPatch;
}): Promise<boolean> {
  const ref = getAdminDb().doc(`workflows/${opts.workflowId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.subAccountId !== opts.subAccountId) {
    return false;
  }
  const { patch } = opts;
  const write: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.name !== undefined) write.name = patch.name.trim() || "Untitled workflow";
  if (patch.status !== undefined) write.status = patch.status;
  if (patch.trigger !== undefined) write.trigger = patch.trigger;
  if (patch.nodes !== undefined) write.nodes = patch.nodes;
  if (patch.startNodeId !== undefined) write.startNodeId = patch.startNodeId;
  await ref.update(write);
  return true;
}

export interface RunView {
  id: string;
  contactId: string;
  contactName: string;
  status: WorkflowRunStatus;
  test: boolean;
  enrolledAtMs: number;
  history: { type: string; result: string; atMs: number }[];
}

export async function listWorkflowRuns(
  subAccountId: string,
  workflowId: string,
): Promise<RunView[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("workflowRuns")
    .where("workflowId", "==", workflowId)
    .get();
  const runs = snap.docs
    .map((d) => d.data() as WorkflowRunDoc)
    .filter((r) => r.subAccountId === subAccountId)
    .sort((a, b) => toMillis(b.enrolledAt) - toMillis(a.enrolledAt))
    .slice(0, 100);

  const ids = [...new Set(runs.map((r) => r.contactId))];
  const nameById = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const c = await db.doc(`contacts/${id}`).get();
      nameById.set(
        id,
        (c.data()?.name as string) || (c.data()?.email as string) || "Contact",
      );
    }),
  );

  return runs.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    contactName: nameById.get(r.contactId) ?? "Contact",
    status: r.status,
    test: r.context?.test === true,
    enrolledAtMs: toMillis(r.enrolledAt),
    history: (r.history ?? []).map((h) => ({
      type: h.type,
      result: h.result,
      atMs: toMillis(h.at),
    })),
  }));
}

export async function deleteWorkflowServerSide(
  subAccountId: string,
  workflowId: string,
): Promise<boolean> {
  const ref = getAdminDb().doc(`workflows/${workflowId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return false;
  await ref.delete();
  return true;
}
