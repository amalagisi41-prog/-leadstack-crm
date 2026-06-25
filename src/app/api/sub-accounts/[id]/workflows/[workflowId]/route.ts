import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  deleteWorkflowServerSide,
  getWorkflow,
  updateWorkflowServerSide,
  type WorkflowPatch,
} from "@/lib/server/workflows-service";
import type { WorkflowNode, WorkflowNodeType } from "@/types/workflows";

export const dynamic = "force-dynamic";

const NODE_TYPES: WorkflowNodeType[] = [
  "send_email",
  "send_sms",
  "whatsapp_template",
  "wait",
  "if_else",
  "goal",
  "add_tag",
  "remove_tag",
  "move_stage",
  "update_field",
  "create_task",
  "notify",
  "webhook",
];

/** Defensive sanitize of a client-supplied nodes map (authed staff, but keep
 *  the shape honest so a malformed save can't poison the engine). */
function sanitizeNodes(raw: unknown): Record<string, WorkflowNode> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, WorkflowNode> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = v as Partial<WorkflowNode>;
    if (!n || typeof n.type !== "string" || !NODE_TYPES.includes(n.type)) {
      return null;
    }
    out[id] = {
      id,
      type: n.type,
      config: (n.config && typeof n.config === "object" ? n.config : {}) as Record<
        string,
        unknown
      >,
      next: typeof n.next === "string" ? n.next : null,
      branches: n.branches
        ? {
            whenTrue:
              typeof n.branches.whenTrue === "string" ? n.branches.whenTrue : null,
            whenFalse:
              typeof n.branches.whenFalse === "string"
                ? n.branches.whenFalse
                : null,
          }
        : undefined,
    };
  }
  return out;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const workflow = await getWorkflow(subAccountId, workflowId);
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ workflow });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: WorkflowPatch = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (body.status === "draft" || body.status === "active" || body.status === "paused") {
    patch.status = body.status;
  }
  if (body.trigger && typeof body.trigger === "object") {
    patch.trigger = body.trigger as WorkflowPatch["trigger"];
  }
  if (body.startNodeId === null || typeof body.startNodeId === "string") {
    patch.startNodeId = body.startNodeId as string | null;
  }
  if (body.nodes !== undefined) {
    const nodes = sanitizeNodes(body.nodes);
    if (nodes === null) {
      return NextResponse.json({ error: "Invalid nodes" }, { status: 400 });
    }
    patch.nodes = nodes;
  }

  const ok = await updateWorkflowServerSide({ subAccountId, workflowId, patch });
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const ok = await deleteWorkflowServerSide(subAccountId, workflowId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
