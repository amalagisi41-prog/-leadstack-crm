"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { TemplateGallery } from "./template-gallery";
import { REAL_ESTATE_AGENT_PRESET } from "@/lib/website-studio/presets";
import type { AgentSiteTemplateId } from "@/types/agent-site";

export function WebsiteStarterTemplates() {
  const { subAccountId } = useSubAccount();
  const [selecting, setSelecting] = useState<AgentSiteTemplateId | null>(null);

  async function start(body: Record<string, unknown>, id: AgentSiteTemplateId) {
    setSelecting(id);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/agent-site`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not start this design.");
      window.open(
        `/sa/${subAccountId}/website-studio/vibe`,
        "_blank",
        "noopener,noreferrer"
      );
      toast.success("Starting design saved. AI Vibe Studio opened.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start this design."
      );
    } finally {
      setSelecting(null);
    }
  }

  return (
    <section className="bg-card rounded-2xl border p-5">
      <p className="mb-5 text-xs font-bold tracking-[0.16em] text-blue-700 uppercase">
        Website starter templates
      </p>
      <TemplateGallery
        selecting={selecting}
        onSelect={(templateId) => void start({ templateId }, templateId)}
        onImportReference={() => {
          const preset = REAL_ESTATE_AGENT_PRESET;
          void start(
            {
              templateId: preset.templateId,
              slug: preset.slug,
              content: preset.content,
            },
            preset.templateId
          );
        }}
      />
    </section>
  );
}
