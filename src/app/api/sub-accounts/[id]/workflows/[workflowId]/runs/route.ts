import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listWorkflowRuns } from "@/lib/server/workflows-service";

export const dynamic = "force-dynamic";

/** GET — recent runs (enrollments) for a workflow, with step history. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const runs = await listWorkflowRuns(subAccountId, workflowId);
  return NextResponse.json({ runs });
}
