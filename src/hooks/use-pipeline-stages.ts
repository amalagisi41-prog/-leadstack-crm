"use client";

import { useMemo } from "react";
import { useSubAccount } from "@/context/sub-account-context";
import { resolvePipelineStages, type PipelineStage } from "@/types/deals";

/**
 * The active sub-account's pipeline stages, with any label/order overrides
 * applied. Reads from the already-subscribed sub-account doc (no extra
 * Firestore read), and falls back to the canonical stages when no overrides
 * are set — so consumers can swap the `PIPELINE_STAGES` constant for this hook
 * with byte-identical behaviour until an admin customises the pipeline.
 */
export function usePipelineStages(): PipelineStage[] {
  const { subAccount } = useSubAccount();
  return useMemo(
    () => resolvePipelineStages(subAccount?.pipelineStages),
    [subAccount?.pipelineStages],
  );
}
