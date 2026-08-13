"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ExternalLink,
  Loader2,
  Rocket,
  LayoutTemplate,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { TemplateGallery } from "./template-gallery";
import { DesignerChat } from "./designer-chat";
import { ContentEditor } from "./content-editor";
import { BusinessSetupAssistant } from "./business-setup-assistant";
import { AgentSiteRenderer } from "./agent-site-renderer";
import {
  AGENT_SITE_TEMPLATE_LIST,
  getTemplate,
} from "@/lib/website-studio/templates";
import { ARTISAN_HOME_NETWORK_PRESET } from "@/lib/website-studio/presets";
import {
  emptyAgentSiteContent,
  type AgentSiteContent,
  type AgentSiteDoc,
  type AgentSiteTemplateId,
} from "@/types/agent-site";

const DESIGN_WIDTH = 1080;

export function WebsiteStudioApp() {
  const {
    subAccountId,
    subAccount,
    loading: subAccountLoading,
  } = useSubAccount();
  const agency = useAgency();
  const gateOpen = subAccount?.websiteStudioEnabledByAgency === true;
  const brandName = agency.name === "AgentStack" ? "your CRM" : agency.name;

  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<AgentSiteDoc | null>(null);
  const [content, setContent] = useState<AgentSiteContent>(
    emptyAgentSiteContent()
  );
  const [selecting, setSelecting] = useState<AgentSiteTemplateId | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [mode, setMode] = useState<"designer" | "edit">("designer");
  const [savingDraft, setSavingDraft] = useState(false);
  const [view, setView] = useState<"builder" | "setup">("builder");
  const [foundationReady, setFoundationReady] = useState(false);

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
    // Wait for the sub-account context to settle (success OR failure)
    // before deciding anything. Previously this only checked `subAccount`
    // for truthiness, so if it never resolved (e.g. a denied/failed read)
    // this component span forever on "Loading…" with no way out.
    if (subAccountLoading) return;
    if (!gateOpen) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const [res, foundationRes] = await Promise.all([
          fetch(`/api/sub-accounts/${subAccountId}/agent-site`),
          fetch(`/api/sub-accounts/${subAccountId}/onboarding-foundation`),
        ]);
        const data = (await res.json()) as { site: AgentSiteDoc | null };
        const foundationData = (await foundationRes.json().catch(() => ({}))) as { foundation?: { domainStartingPoint?: string | null; hostingStartingPoint?: string | null } };
        if (!active) return;
        setFoundationReady(Boolean(foundationData.foundation?.domainStartingPoint && foundationData.foundation?.domainStartingPoint !== "not_sure" && foundationData.foundation?.hostingStartingPoint));
        setSite(data.site);
        if (data.site) setContent(data.site.content);
      } catch {
        // Network/parse failure — fall through to the empty-site state
        // (template gallery) instead of spinning forever.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [subAccountId, gateOpen, subAccountLoading]);

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
    [subAccountId]
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

  async function importArtisanPreset() {
    const preset = ARTISAN_HOME_NETWORK_PRESET;
    setSelecting(preset.templateId);
    try {
      const s = await patch({
        templateId: preset.templateId,
        slug: preset.slug,
        content: preset.content,
      });
      setSite(s);
      setContent(s.content);
      setMode("edit");
      toast.success("Artisan Home Network was loaded into a private draft.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not import the reference site."
      );
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

  async function saveContent(next: AgentSiteContent) {
    setSavingDraft(true);
    try {
      const s = await patch({ content: next });
      setSite(s);
      setContent(s.content);
    } finally {
      setSavingDraft(false);
    }
  }

  async function publish() {
    if (!foundationReady) {
      toast.error("Finish domain and hosting setup before publishing.");
      return;
    }
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

  if (subAccount && !gateOpen) {
    return (
      <div className="bg-card mx-auto max-w-lg rounded-2xl border p-8 text-center">
        <div className="bg-muted text-muted-foreground mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold">
          AI Website Studio is a premium add-on
        </h1>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
          Build a stunning agent website from premium templates with an AI
          Designer — plus guided setup for A2P, chat widgets, SEO, and more. Ask
          your agency to enable it for your account.
        </p>
      </div>
    );
  }

  const tabRow = (
    <div className="flex w-fit items-center gap-1 rounded-lg border p-1">
      <button
        onClick={() => setView("builder")}
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === "builder" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"}`}
      >
        Website Builder
      </button>
      <button
        onClick={() => setView("setup")}
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === "setup" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"}`}
      >
        Business Setup
      </button>
    </div>
  );

  if (view === "setup") {
    return (
      <div className="space-y-4">
        {tabRow}
        <BusinessSetupAssistant />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {tabRow}
        <div className="text-muted-foreground flex h-64 items-center justify-center">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading AI Website
          Studio…
        </div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="space-y-4">
        {tabRow}
        <TemplateGallery
          onSelect={pickTemplate}
          onImportReference={importArtisanPreset}
          selecting={selecting}
        />
      </div>
    );
  }

  const template = getTemplate(site.templateId);
  const liveUrl = `/agent/${subAccountId}/${site.slug}`;

  return (
    <div className="space-y-4">
      {tabRow}
      {/* Toolbar */}
      {!foundationReady ? <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-amber-900">Preview is ready. Publishing comes after the foundation.</p><p className="mt-1 text-xs text-amber-800">Choose the domain and hosting path first so visitors never receive an unfinished or disconnected site.</p></div><Button size="sm" variant="outline" render={<a href={`/sa/${subAccountId}/get-started`} />}>Finish domain &amp; hosting</Button></div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            AI Website Studio
          </h1>
          <p className="text-muted-foreground text-xs">
            {site.status === "published" ? "Published" : "Draft"} · Template:{" "}
            {template.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Template switcher */}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <LayoutTemplate className="text-muted-foreground ml-1 h-3.5 w-3.5" />
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
            <Button
              variant="outline"
              size="sm"
              render={<a href={liveUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> View live
            </Button>
          )}
          <Button size="sm" onClick={publish} disabled={publishing || !foundationReady}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            {publishing
              ? "Publishing…"
              : site.status === "published"
                ? "Re-publish"
                : foundationReady ? "Publish" : "Foundation required"}
          </Button>
        </div>
      </div>

      {/* Split: Designer chat + live preview */}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="flex h-[72vh] flex-col gap-2">
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <button
              onClick={() => setMode("designer")}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "designer"
                  ? "bg-[#1a2f50] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              AI Designer
            </button>
            <button
              onClick={() => setMode("edit")}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "edit"
                  ? "bg-[#1a2f50] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Edit content
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {mode === "designer" ? (
              <DesignerChat
                subAccountId={subAccountId}
                brandName={brandName}
                initialTranscript={site.designerTranscript ?? []}
                initialStep={site.designerStep ?? 0}
                totalSteps={10}
                onContent={setContent}
              />
            ) : (
              <ContentEditor
                content={content}
                onChange={setContent}
                onSave={saveContent}
                saving={savingDraft}
              />
            )}
          </div>
        </div>

        <div className="bg-muted/30 overflow-hidden rounded-2xl border">
          <div className="bg-card flex items-center justify-between border-b px-4 py-2">
            <span className="text-muted-foreground text-xs font-medium">
              Live preview · updates as you answer
            </span>
          </div>
          <div
            ref={previewWrapRef}
            className="h-[calc(72vh-41px)] overflow-y-auto"
          >
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
