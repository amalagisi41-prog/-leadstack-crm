import { WorkflowRuns } from "@/components/workflows/workflow-runs";

export default async function WorkflowRunsPage({
  params,
}: {
  params: Promise<{ subAccountId: string; workflowId: string }>;
}) {
  const { subAccountId, workflowId } = await params;
  return <WorkflowRuns saId={subAccountId} workflowId={workflowId} />;
}
