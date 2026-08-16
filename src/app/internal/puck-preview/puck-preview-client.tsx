"use client";

import { useState } from "react";
import { PuckAgentSiteEditor } from "@/components/website-studio/puck-agent-site-editor";
import { defaultAgentSiteComposition } from "@/lib/website-studio/site-composition";

export function PuckPreviewClient() {
  const [composition, setComposition] = useState(
    defaultAgentSiteComposition(),
  );

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto mb-4 flex max-w-[1500px] items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.16em] text-slate-500">
            AGENTSTACK · LOCAL DESIGN QA
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            Puck + Zack Visual Builder
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Drag realtor sections, switch viewports, and review the component catalog.
          </p>
        </div>
        <div className="rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-xs font-bold text-emerald-800">
          Local only · saving disabled
        </div>
      </div>
      <div className="mx-auto max-w-[1500px]">
        <PuckAgentSiteEditor
          composition={composition}
          onChange={setComposition}
          onSave={() => undefined}
        />
      </div>
    </main>
  );
}
