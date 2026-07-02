"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Rocket, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { TemplateGallery } from "./template-gallery";
import { DesignerChat } from "./designer-chat";
import { AgentSiteRenderer } from "./agent-site-renderer";
import {
  AGENT_SITE_TEMPLATE_LIST,
  getTemplate,
} from "@/lib/website-studio/templates";
import {
  emptyAgentSiteContent,
  type AgentSiteContent,
  type AgentSiteDoc,
  type AgentSiteTemplateId,
} from "@/types/agent-site";

const DESIGN_WIDTH = 1080;

export function WebsiteStudioApp() {
  const { subAccountId } = useSubAccount();
  const agency = useAgency();
  const brandName = agency.name === "LeadStack" ? "your CRM" : agency.name;

  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<AgentSiteDoc | null>(null);
  const [content, setContent] = useState<AgentSiteContent>(emptyAgentSiteContent());
  const [selecting, setSelecting] = useState<AgentSiteTemplateId | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Scaled live-preview sizing.
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setScale(el.clientWidth / DESIGN_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [site]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/sub-accounts/${subAccountId}/agent-site`);
        const data = (await res.json()) as { site: AgentSiteDoc | null };
        if (!active) return;
        setSite(data.site);
        if (data.site) setContent(data.site.content);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [subAccountId]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/agent-site`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        site?: AgentSiteDoc;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      return data.site!;
    },
    [subAccountId],
  );

  async function pickTemplate(id: AgentSiteTemplateId) {
    setSelecting(id);
    try {
      const s = await patch({ templateId: id });
      setSite(s);
      setContent(s.content);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start.");
    } finally {
      setSelecting(null);
    }
  }

  async function switchTemplate(id: AgentSiteTemplateId) {
    if (!site || id === site.templateId) return;
    try {
      const s = await patch({ templateId: id });
      setSite(s);
      toast.success(`Switched to ${getTemplate(id).name}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch.");
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const s = await patch({ status: "published" });
      setSite(s);
      toast.success("Your site is live!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Website Studio…
      </div>
    );
  }

  if (!site) {
    return <TemplateGallery onSelect={pickTemplate} selecting={selecting} />;
  }

  const template = getTemplate(site.templateId);
  const liveUrl = `/agent/${subAccountId}/${site.slug}`;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Website Studio</h1>
          <p className="text-xs text-muted-foreground">
            {site.status === "published" ? "Published" : "Draft"} · Template:{" "}
            {template.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Template switcher */}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <LayoutTemplate className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
            {AGENT_SITE_TEMPLATE_LIST.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTemplate(t.id)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  t.id === site.templateId
                    ? "bg-[#1a2f50] text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          {site.status === "published" && (
            <Button variant="outline" size="sm" render={<a href={liveUrl} target="_blank" rel="noreferrer" />}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> View live
            </Button>
          )}
          <Button size="sm" onClick={publish} disabled={publishing}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            {publishing ? "Publishing…" : site.status === "published" ? "Re-publish" : "Publish"}
          </Button>
        </div>
      </div>

      {/* Split: Designer chat + live preview */}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="h-[72vh]">
          <DesignerChat
            subAccountId={subAccountId}
            brandName={brandName}
            initialTranscript={site.designerTranscript ?? []}
            initialStep={site.designerStep ?? 0}
            totalSteps={10}
            onContent={setContent}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border bg-muted/30">
          <div className="flex items-center justify-between border-b bg-card px-4 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Live preview · updates as you answer
            </span>
          </div>
          <div ref={previewWrapRef} className="h-[calc(72vh-41px)] overflow-y-auto">
            {/* Scale the 1080px design down to the panel width. */}
            <div
              style={{
                width: DESIGN_WIDTH,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                height: scale > 0 ? undefined : 0,
              }}
            >
              <AgentSiteRenderer template={template} content={content} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
