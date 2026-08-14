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
  WandSparkles,
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
import { ExactTransferStudio } from "./exact-transfer-studio";
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
import type { WebsiteTransferDoc } from "@/types/website-transfer";
import {
  hasImportedExactSite,
  type WebsiteStudioView,
} from "@/lib/website-studio/initial-view";

const DESIGN_WIDTH = 1080;

export function WebsiteStudioApp({
  workspace = "home",
}: {
  workspace?: "home" | "vibe" | "exact";
}) {
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
  const [view, setView] = useState<WebsiteStudioView>("builder");
  const [transfer, setTransfer] = useState<WebsiteTransferDoc | null>(null);
  const [foundationReady, setFoundationReady] = useState(false);
  const [foundationLoaded, setFoundationLoaded] = useState(false);

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
        const [res, foundationRes, transferRes] = await Promise.all([
          fetch(`/api/sub-accounts/${subAccountId}/agent-site`),
          fetch(`/api/sub-accounts/${subAccountId}/onboarding-foundation`),
          fetch(`/api/sub-accounts/${subAccountId}/website-transfer`),
        ]);
        const data = (await res.json()) as { site: AgentSiteDoc | null };
        const foundationData = (await foundationRes
          .json()
          .catch(() => ({}))) as {
          foundation?: {
            domainStartingPoint?: string | null;
            hostingStartingPoint?: string | null;
            domainSetupConfirmed?: boolean;
            hostingSetupConfirmed?: boolean;
          };
        };
        const transferData = (await transferRes.json().catch(() => ({}))) as {
          transfer?: WebsiteTransferDoc | null;
        };
        if (!active) return;
        const ready = Boolean(
          foundationData.foundation?.domainStartingPoint &&
          foundationData.foundation.domainStartingPoint !== "not_sure" &&
          foundationData.foundation?.hostingStartingPoint &&
          foundationData.foundation.domainSetupConfirmed !== false &&
          foundationData.foundation.hostingSetupConfirmed !== false
        );
        setFoundationReady(ready);
        setFoundationLoaded(true);
        setTransfer(transferData.transfer ?? null);
        let loadedSite = data.site;
        if (loadedSite && ready) {
          const hydrateRes = await fetch(
            `/api/sub-accounts/${subAccountId}/agent-site`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ hydrateFromBlueprint: true }),
            }
          );
          if (hydrateRes.ok) {
            const hydrated = (await hydrateRes.json()) as {
              site?: AgentSiteDoc;
            };
            loadedSite = hydrated.site ?? loadedSite;
          }
        }
        if (!active) return;
        setSite(loadedSite);
        if (loadedSite) {
          setContent(loadedSite.content);
        }
        setView(
          !ready
            ? "setup"
            : workspace === "exact" &&
                hasImportedExactSite(transferData.transfer)
              ? "exact"
              : workspace === "vibe"
                ? "vibe"
                : "builder"
        );
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
  }, [subAccountId, gateOpen, subAccountLoading, workspace]);

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
      setView("vibe");
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
      setView("vibe");
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

  const dedicatedWorkspace = workspace !== "home";
  const tabRow = dedicatedWorkspace ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3">
      <div>
        <p className="font-semibold">
          {workspace === "exact"
            ? "Imported exact-site workspace"
            : "Dedicated AI Vibe Studio"}
        </p>
        <p className="text-muted-foreground text-xs">
          Templates are hidden in this window so the selected design remains
          isolated.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        render={<a href={`/sa/${subAccountId}/website-studio`} />}
      >
        Back to starting designs
      </Button>
    </div>
  ) : (
    <div className="flex w-fit items-center gap-1 rounded-lg border p-1">
      {hasImportedExactSite(transfer) ? (
        <a
          href={`/sa/${subAccountId}/website-studio/imported`}
          target="_blank"
          rel="noreferrer"
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === "exact" ? "bg-emerald-700 text-white" : "text-emerald-700 hover:text-emerald-900"}`}
        >
          Imported exact site
        </a>
      ) : null}
      <button
        type="button"
        onClick={() => setView("builder")}
        disabled={!foundationLoaded || !foundationReady}
        title={
          !foundationReady
            ? "Confirm a domain and hosting path first"
            : undefined
        }
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === "builder" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"} disabled:cursor-not-allowed disabled:opacity-45`}
      >
        {foundationReady ? "AgentStack Templates" : "Templates · Locked"}
      </button>
      <a
        href={`/sa/${subAccountId}/website-studio/vibe`}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!foundationLoaded || !foundationReady}
        onClick={(event) => {
          if (!foundationLoaded || !foundationReady) event.preventDefault();
        }}
        title={
          !foundationReady
            ? "Confirm a domain and hosting path first"
            : undefined
        }
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === "vibe" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"} aria-disabled:cursor-not-allowed aria-disabled:opacity-45`}
      >
        {foundationReady ? "Vibe Builder" : "Vibe Builder · Locked"}
      </a>
      <button
        type="button"
        onClick={() => setView("setup")}
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === "setup" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"}`}
      >
        {foundationReady ? "Setup tools" : "Business Setup"}
      </button>
    </div>
  );

  if (view === "exact" && transfer) {
    return (
      <div className="space-y-4">
        {tabRow}
        <ExactTransferStudio transfer={transfer} />
      </div>
    );
  }

  if (view === "setup") {
    return (
      <div className="space-y-4">
        {tabRow}
        <BusinessSetupAssistant
          foundationComplete={foundationReady}
          onFoundationChange={(ready) => {
            setFoundationReady(ready);
            setFoundationLoaded(true);
          }}
        />
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

  if (view === "builder") {
    return (
      <div className="space-y-4">
        {tabRow}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
            <LayoutTemplate className="h-5 w-5 text-blue-700" />
            <h2 className="mt-3 font-semibold text-blue-950">
              Start from an AgentStack template
            </h2>
            <p className="mt-1 text-sm text-blue-900/75">
              Fastest path. Choose a conversion-tested real-estate design, then
              customize its content and branding in the private viewer.
            </p>
          </div>
          <a
            href={`/sa/${subAccountId}/website-studio/vibe`}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-violet-50 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            <WandSparkles className="h-5 w-5 text-fuchsia-600" />
            <h2 className="mt-3 font-semibold text-violet-950">
              Create with Vibe Builder
            </h2>
            <p className="mt-1 text-sm text-violet-900/75">
              Describe the look, voice, pages, and changes you want while the
              private build updates beside your conversation.
            </p>
            <span className="mt-3 inline-flex text-sm font-semibold text-fuchsia-700">
              Open the side-by-side builder →
            </span>
          </a>
        </div>
        <TemplateGallery
          onSelect={pickTemplate}
          onImportReference={importArtisanPreset}
          selecting={selecting}
        />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="space-y-4">
        {tabRow}
        <div className="grid min-h-[62vh] overflow-hidden rounded-2xl border lg:grid-cols-[380px_1fr]">
          <div className="bg-card flex flex-col justify-center border-b p-7 lg:border-r lg:border-b-0">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-sm">
              <WandSparkles className="h-5 w-5" />
            </span>
            <p className="mt-5 text-xs font-bold tracking-[0.18em] text-fuchsia-600 uppercase">
              Internal AgentStack builder
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              Describe it. Watch it take shape.
            </h1>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              Zack uses your Business Blueprint to guide the first draft. You
              can then prompt changes, edit the approved content directly, and
              switch visual styles without leaving AgentStack.
            </p>
            <Button
              className="mt-6"
              onClick={() => void pickTemplate("coastal")}
              disabled={!!selecting}
            >
              {selecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <WandSparkles className="mr-2 h-4 w-4" />
              )}
              Start a private Vibe build
            </Button>
            <button
              type="button"
              onClick={() => setView("builder")}
              className="text-muted-foreground hover:text-foreground mt-3 text-sm font-medium"
            >
              Prefer a template? View designs
            </button>
          </div>
          <div className="flex items-center justify-center bg-gradient-to-br from-[#edf4ff] via-white to-[#fff0f8] p-8">
            <div className="w-full max-w-xl rounded-2xl border bg-white/90 p-6 shadow-xl shadow-blue-950/10">
              <div className="flex items-center gap-2 border-b pb-4">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="text-muted-foreground ml-2 text-xs">
                  Private live viewer
                </span>
              </div>
              <div className="mt-6 space-y-3">
                <div className="h-5 w-2/3 rounded bg-[#1d3f76]" />
                <div className="h-3 w-full rounded bg-slate-200" />
                <div className="h-3 w-4/5 rounded bg-slate-200" />
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="h-28 rounded-xl bg-blue-100" />
                  <div className="h-28 rounded-xl bg-fuchsia-100" />
                  <div className="h-28 rounded-xl bg-violet-100" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const template = getTemplate(site.templateId);
  const liveUrl = `/agent/${subAccountId}/${site.slug}`;

  return (
    <div className="space-y-4">
      {tabRow}
      <div className="flex flex-col gap-3 rounded-2xl border border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 to-violet-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white">
            <WandSparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-violet-950">
              Vibe Builder · private side-by-side workspace
            </p>
            <p className="mt-0.5 text-xs text-violet-900/70">
              Prompt Zack or edit content on the left. Review every change live
              on the right. Nothing publishes without your approval.
            </p>
          </div>
        </div>
        {!dedicatedWorkspace ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setView("builder")}
          >
            <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" />
            Change starting design
          </Button>
        ) : null}
      </div>
      {/* Toolbar */}
      {!foundationReady ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Preview is ready. Publishing comes after the foundation.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Choose the domain and hosting path first so visitors never receive
              an unfinished or disconnected site.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            render={<a href={`/sa/${subAccountId}/get-started`} />}
          >
            Finish domain &amp; hosting
          </Button>
        </div>
      ) : null}
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
          {!dedicatedWorkspace ? (
            <div className="flex items-center gap-1 rounded-lg border p-1">
              <LayoutTemplate className="text-muted-foreground ml-1 h-3.5 w-3.5" />
              {AGENT_SITE_TEMPLATE_LIST.map((t) => (
                <button
                  type="button"
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
          ) : null}
          {site.status === "published" && (
            <Button
              variant="outline"
              size="sm"
              render={<a href={liveUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> View live
            </Button>
          )}
          <Button
            size="sm"
            onClick={publish}
            disabled={publishing || !foundationReady}
          >
            <Rocket className="mr-1 h-3.5 w-3.5" />
            {publishing
              ? "Publishing…"
              : site.status === "published"
                ? "Re-publish"
                : foundationReady
                  ? "Publish"
                  : "Foundation required"}
          </Button>
        </div>
      </div>

      {/* Split: Designer chat + live preview */}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="flex h-[72vh] flex-col gap-2">
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <button
              type="button"
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
              type="button"
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
                experience="vibe"
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
