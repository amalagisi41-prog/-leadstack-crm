import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { qstashIsConfigured } from "@/lib/automations/qstash";
import {
  createWorkflowServerSide,
  listWorkflows,
} from "@/lib/server/workflows-service";

export const dynamic = "force-dynamic";

/** GET — list this sub-account's workflows. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const workflows = await listWorkflows(subAccountId);
  // Whether this deployment can actually RUN a workflow, right now.
  //
  // Every workflow executes by scheduling its first node through QStash. With
  // QStash absent the engine enrolls the contact, increments the counter, and
  // marks the run failed — so an "Active" row is not merely inactive, it is
  // actively misleading. Sending the live answer with the list lets the UI say
  // so on every existing workspace without a data migration, and lets the
  // answer correct itself the moment the keys are added.
  return NextResponse.json({
    workflows,
    automaticSendingConfigured: qstashIsConfigured(),
  });
}

/** POST — create a draft workflow, returns its id. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { name?: string; template?: "blank" | "speed-to-lead" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const workflowId = await createWorkflowServerSide({
    subAccountId,
    createdByUid: access.uid,
    name:
      body.name ??
      (body.template === "speed-to-lead" ? "Speed-to-Lead" : "Untitled workflow"),
    template: body.template,
  });
  return NextResponse.json({ id: workflowId });
}
