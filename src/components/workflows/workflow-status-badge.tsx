import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkflowStatus } from "@/types/workflows";

/**
 * Status pill shared by the workflows list + the builder header so the colours
 * stay in sync: active → green, draft → amber, paused → neutral.
 */
const STATUS_STYLES: Record<WorkflowStatus, string> = {
  active:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  draft:
    "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  paused: "border-transparent bg-muted text-muted-foreground",
};

export function WorkflowStatusBadge({
  status,
  className,
}: {
  status: WorkflowStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status], className)}>
      {status}
    </Badge>
  );
}
