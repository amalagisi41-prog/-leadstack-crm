"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Monitor,
  Smartphone,
  ExternalLink,
  Loader2,
  Rocket,
  LayoutTemplate,
  Lock,
  WandSparkles,
  ShieldCheck,
  TriangleAlert,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { DesignerChat } from "./designer-chat";
import { ContentEditor } from "./content-editor";
import { SiteStructureEditor } from "./site-structure-editor";
import { BusinessSetupAssistant } from "./business-setup-assistant";
import { AgentSiteRenderer } from "./agent-site-renderer";
import { WebsitePreviewCanvas } from "./website-preview-canvas";
import { SiteRevisionHistory } from "./site-revision-history";
import {
  AGENT_SITE_TEMPLATE_LIST,
  getTemplate,
} from "@/lib/website-studio/templates";
import {
  emptyAgentSiteContent,
  type AgentSiteComposition,
  type AgentSiteContent,
  type AgentSiteDoc,
  type AgentSiteTemplateId,
} from "@/types/agent-site";
import {
  defaultAgentSiteComposition,
  normalizeAgentSiteComposition,
} from "@/lib/website-studio/site-composition";
import {
  getWorkspaceWebsiteStudioView,
  type WebsiteStudioView,
} from "@/lib/website-studio/initial-view";
import type { WebsitePreviewDevice } from "@/lib/website-studio/preview-viewport";
import {
  assessAgentSitePublishReadiness,
  hasPublishBlockers,
} from "@/lib/website-studio/publish-readiness";
import type { ReleaseAssuranceReport } from "@/lib/website-studio/release-assurance";

const PuckAgentSiteEditor = dynamic(
  () =>
    import("./puck-agent-site-editor").then(
      (module) => module.PuckAgentSiteEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-[72vh] items-center justify-center rounded-2xl border text-sm">
        Loading visual builder…
      </div>
    ),
  }
);

export function WebsiteStudioApp({
  workspace = "home",
}: {
  workspace?: "home" | "vibe";
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
  const [composition, setComposition] = useState<AgentSiteComposition>(
    defaultAgentSiteComposition()
  );
  const [selecting, setSelecting] = useState<AgentSiteTemplateId | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [mode, setMode] = useState<
    "designer" | "edit" | "structure" | "visual"
  >("designer");
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingStructure, setSavingStructure] = useState(false);
  const [view, setView] = useState<WebsiteStudioView>(() =>
    workspace === "home" ? "builder" : workspace
  );
  const [foundationReady, setFoundationReady] = useState(false);
  const [previewDevice, setPreviewDevice] =
    useState<WebsitePreviewDevice>("desktop");
  const [releaseReport, setReleaseReport] =
    useState<ReleaseAssuranceReport | null>(null);
  const [releaseApproved, setReleaseApproved] = useState(false);
  const [checkingRelease, setCheckingRelease] = useState(false);
  const readinessIssues = useMemo(
    () => assessAgentSitePublishReadiness(content),
    [content]
  );
  const publishBlocked = hasPublishBlockers(readinessIssues);
  const recordJourneyEvent = useCallback(
    (event: "trusted_preview" | "release_approved" | "published") => {
      if (!subAccountId) return;
      void fetch(`/api/sub-accounts/${subAccountId}/onboarding-evaluation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      });
    },
    [subAccountId]
  );

  useEffect(() => {
    if (!site || !subAccountId) return;
    let active = true;
    void (async () => {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/agent-site/release-assurance`
      );
      const data = (await response.json().catch(() => ({}))) as {
        report?: ReleaseAssuranceReport;
        approved?: boolean;
      };
      if (!active || !response.ok) return;
      setReleaseReport(data.report ?? null);
      setReleaseApproved(data.approved === true);
    })();
    return () => {
      active = false;
    };
  }, [site, subAccountId]);

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
        if (!active) return;
        const ready = Boolean(
          foundationData.foundation?.domainStartingPoint &&
          foundationData.foundation.domainStartingPoint !== "not_sure" &&
          foundationData.foundation?.hostingStartingPoint &&
          foundationData.foundation.domainSetupConfirmed !== false &&
          foundationData.foundation.hostingSetupConfirmed !== false
        );
        setFoundationReady(ready);
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
          setComposition(normalizeAgentSiteComposition(loadedSite.composition));
          const eventKey = `agentstack-trusted-preview-${subAccountId}`;
          if (!window.sessionStorage.getItem(eventKey)) {
            window.sessionStorage.setItem(eventKey, "1");
            recordJourneyEvent("trusted_preview");
          }
        }
        setView(
          getWorkspaceWebsiteStudioView({
            workspace,
            foundationReady: ready,
            hasTemplateSite: Boolean(loadedSite),
          })
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
  }, [
    subAccountId,
    gateOpen,
    subAccountLoading,
    workspace,
    recordJourneyEvent,
  ]);

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
      const s = await patch({
        templateId: id,
        revisionSource: "structure",
        revisionLabel: `Before switching to ${getTemplate(id).name}`,
      });
      setSite(s);
      setContent(s.content);
      setComposition(normalizeAgentSiteComposition(s.composition));
      setView("vibe");
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

  async function saveContent(next: AgentSiteContent) {
    setSavingDraft(true);
    try {
      const s = await patch({
        content: next,
        revisionSource: "content",
        revisionLabel: "Before manual content edit",
      });
      setSite(s);
      setContent(s.content);
    } finally {
      setSavingDraft(false);
    }
  }

  async function saveComposition(
    next: AgentSiteComposition,
    source: "structure" | "puck" = "structure"
  ) {
    setSavingStructure(true);
    try {
      const s = await patch({
        composition: next,
        revisionSource: source,
        revisionLabel:
          source === "puck"
            ? "Before Puck visual edit"
            : "Before page structure edit",
      });
      const normalized = normalizeAgentSiteComposition(s.composition);
      setSite(s);
      setComposition(normalized);
    } finally {
      setSavingStructure(false);
    }
  }

  async function publish() {
    if (!foundationReady) {
      toast.error("Finish domain and hosting setup before publishing.");
      return;
    }
    if (publishBlocked) {
      toast.error("Complete the publish checklist before publishing.");
      setMode("edit");
      return;
    }
    if (!releaseApproved) {
      toast.error("Run and approve the release check before publishing.");
      return;
    }
    setPublishing(true);
    try {
      const s = await patch({
        status: "published",
        revisionSource: "publish",
        revisionLabel: "Before publish",
      });
      setSite(s);
      toast.success("Your site is live!");
      recordJourneyEvent("published");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setPublishing(false);
    }
  }

  async function runReleaseAssurance() {
    setCheckingRelease(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/agent-site/release-assurance`,
        { method: "POST" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        report?: ReleaseAssuranceReport;
        approved?: boolean;
      };
      if (data.report) setReleaseReport(data.report);
      if (!response.ok) throw new Error(data.error || "Release check failed.");
      setReleaseApproved(data.approved === true);
      toast.success("Release check passed and this draft is approved.");
      recordJourneyEvent("release_approved");
    } catch (error) {
      setReleaseApproved(false);
      toast.error(
        error instanceof Error ? error.message : "Release check failed."
      );
    } finally {
      setCheckingRelease(false);
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
        <p className="font-semibold">Vibe Website Studio</p>
        <p className="text-muted-foreground text-xs">
          Design and preview the AgentStack-hosted site. Nothing publishes until
          you approve it.
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
      <button
        type="button"
        onClick={() => setView("builder")}
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === "builder" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"}`}
      >
        Ready-made sites
      </button>
      <a
        href={`/sa/${subAccountId}/website-studio/vibe`}
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === "vibe" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"}`}
      >
        Vibe Builder
      </a>
      <button
        type="button"
        onClick={() => setView("setup")}
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${view === "setup" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"}`}
      >
        Website &amp; Domain
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {dedicatedWorkspace ? tabRow : null}
        <div className="text-muted-foreground flex h-64 items-center justify-center">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing your
          private website workspace…
        </div>
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
          }}
        />
      </div>
    );
  }

  if (view === "builder") {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-6">
          <p className="text-xs font-bold tracking-[0.16em] text-blue-700 uppercase">
            AI Website Studio
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            Build a custom site or continue your existing one
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            Work privately inside AgentStack. Managed domain, hosting, and
            credentials stay in the guided workspace; nothing publishes until
            you approve it.
          </p>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <a
            href={`/sa/${subAccountId}/website-studio/vibe`}
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
              Open custom AI Studio →
            </span>
          </a>
          <a
            href={`/sa/${subAccountId}/domain`}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            <ExternalLink className="h-5 w-5 text-emerald-700" />
            <h2 className="mt-3 font-semibold text-emerald-950">
              I already have a website
            </h2>
            <p className="mt-1 text-sm text-emerald-900/75">
              Keep the current site live while you choose the guided hosting and
              transfer path. AgentStack never proxies it into the editor.
            </p>
            <span className="mt-3 inline-flex text-sm font-semibold text-emerald-700">
              Open Website &amp; Domain →
            </span>
          </a>
          <button
            type="button"
            onClick={() => setView("setup")}
            className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            <Lock className="h-5 w-5 text-blue-700" />
            <h2 className="mt-3 font-semibold text-blue-950">
              Domain, hosting &amp; private keys
            </h2>
            <p className="mt-1 text-sm text-blue-900/75">
              Use AgentStack-managed setup without leaving the platform or
              exposing provider passwords in the builder.
            </p>
            <span className="mt-3 inline-flex text-sm font-semibold text-blue-700">
              Open secure setup →
            </span>
          </button>
        </div>
        <p className="text-muted-foreground text-center text-xs">
          Looking for a starter design? Website templates now live in the
          Templates section.
        </p>
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
      <div
        className={`rounded-xl border p-4 ${
          publishBlocked
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex items-start gap-3">
          {publishBlocked ? (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          ) : (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          )}
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-semibold ${
                publishBlocked ? "text-amber-950" : "text-emerald-950"
              }`}
            >
              {publishBlocked
                ? "Publish checklist needs attention"
                : "Required publishing details are complete"}
            </p>
            {readinessIssues.length ? (
              <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {readinessIssues.map((issue) => (
                  <li
                    key={`${issue.field}-${issue.message}`}
                    className={
                      issue.severity === "blocker"
                        ? "text-amber-900"
                        : "text-slate-600"
                    }
                  >
                    {issue.severity === "blocker" ? "Required" : "Review"}:{" "}
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-emerald-800">
                Domain readiness is checked separately when you publish.
              </p>
            )}
          </div>
          {publishBlocked ? (
            <Button size="sm" variant="outline" onClick={() => setMode("edit")}>
              Fix details
            </Button>
          ) : null}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Release assurance
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Checks the exact draft’s route, responsive structure, assets,
                lead path, compliance, integrations, and rollback target.
              </p>
              {releaseReport ? (
                <div className="mt-2 text-xs text-slate-700">
                  <p className="font-medium">
                    {
                      releaseReport.checks.filter(
                        (check) => check.status === "passed"
                      ).length
                    }{" "}
                    passed ·{" "}
                    {
                      releaseReport.checks.filter(
                        (check) => check.status === "warning"
                      ).length
                    }{" "}
                    warnings ·{" "}
                    {
                      releaseReport.checks.filter(
                        (check) => check.status === "blocked"
                      ).length
                    }{" "}
                    blocked
                  </p>
                  <ul className="mt-2 space-y-1 text-rose-700">
                    {releaseReport.checks
                      .filter((check) => check.status === "blocked")
                      .map((check) => (
                        <li key={check.id}>• {check.detail}</li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
          <Button
            size="sm"
            variant={releaseApproved ? "outline" : "default"}
            onClick={() => void runReleaseAssurance()}
            disabled={checkingRelease}
          >
            {checkingRelease
              ? "Checking…"
              : releaseApproved
                ? "Approved for release"
                : "Run release check"}
          </Button>
        </div>
      </div>
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
          <SiteRevisionHistory
            subAccountId={subAccountId}
            onRestore={(restored) => {
              setSite(restored);
              setContent(restored.content);
              setComposition(
                normalizeAgentSiteComposition(restored.composition)
              );
            }}
          />
          <Button
            size="sm"
            onClick={publish}
            disabled={
              publishing ||
              !foundationReady ||
              publishBlocked ||
              !releaseApproved
            }
          >
            <Rocket className="mr-1 h-3.5 w-3.5" />
            {publishing
              ? "Publishing…"
              : site.status === "published"
                ? "Re-publish"
                : foundationReady && !publishBlocked && releaseApproved
                  ? "Publish"
                  : !releaseApproved
                    ? "Release check required"
                    : publishBlocked
                      ? "Checklist required"
                      : "Foundation required"}
          </Button>
        </div>
      </div>

      {/* Split: Designer chat + live preview */}
      {mode === "visual" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Puck + Zack</div>
              <div className="text-muted-foreground text-xs">
                Drag sections visually. Zack and manual content edits continue
                to use the same site data.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode("designer")}
            >
              Back to Zack
            </Button>
          </div>
          <PuckAgentSiteEditor
            composition={composition}
            onChange={(next) => {
              setComposition(next);
              setReleaseApproved(false);
            }}
            onSave={(next) => saveComposition(next, "puck")}
          />
        </div>
      ) : (
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
              <button
                type="button"
                onClick={() => setMode("structure")}
                className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "structure"
                    ? "bg-[#1a2f50] text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Page structure
              </button>
              <button
                type="button"
                onClick={() => setMode("visual")}
                className="text-muted-foreground hover:text-foreground flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors"
              >
                Puck + Zack
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
                  onContent={(next) => {
                    setContent(next);
                    setReleaseApproved(false);
                  }}
                />
              ) : mode === "edit" ? (
                <ContentEditor
                  content={content}
                  onChange={(next) => {
                    setContent(next);
                    setReleaseApproved(false);
                  }}
                  onSave={saveContent}
                  saving={savingDraft}
                />
              ) : (
                <SiteStructureEditor
                  composition={composition}
                  onChange={(next) => {
                    setComposition(next);
                    setReleaseApproved(false);
                  }}
                  onSave={saveComposition}
                  saving={savingStructure}
                />
              )}
            </div>
          </div>

          <div className="bg-muted/30 overflow-hidden rounded-2xl border">
            <div className="bg-card flex items-center justify-between gap-3 border-b px-4 py-2">
              <span className="text-muted-foreground text-xs font-medium">
                Live preview · updates as you answer
              </span>
              <div
                className="bg-muted flex rounded-lg p-1"
                aria-label="Preview device"
              >
                {(
                  [
                    ["desktop", Monitor, "Desktop"],
                    ["mobile", Smartphone, "Mobile"],
                  ] as const
                ).map(([device, Icon, label]) => (
                  <button
                    key={device}
                    type="button"
                    onClick={() => setPreviewDevice(device)}
                    aria-pressed={previewDevice === device}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      previewDevice === device
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <WebsitePreviewCanvas device={previewDevice}>
              <AgentSiteRenderer
                template={template}
                content={content}
                composition={composition}
                editing
                idx={{
                  connected: Boolean(
                    subAccount?.idxEnabledByAgency === true &&
                    subAccount.idxConfig?.enabled
                  ),
                  url: `/idx/${subAccountId}`,
                  displayName: subAccount?.idxConfig?.displayName ?? undefined,
                }}
              />
            </WebsitePreviewCanvas>
          </div>
        </div>
      )}
    </div>
  );
}
