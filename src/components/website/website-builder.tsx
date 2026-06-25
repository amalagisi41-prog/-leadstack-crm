"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  blankBusinessDetails,
  blankServicesConfig,
  blankVslConfig,
  blankWebsiteConfig,
  sampleVslConfig,
  sampleWebsiteConfig,
  type BuildType,
  type Niche,
  type WebsiteBusinessDetails,
  type WebsiteConfig,
  type WebsiteDoc,
  type WebsiteServicesConfig,
} from "@/types/website";
import {
  isNicheKey,
  NICHE_KEYS,
  NICHE_META,
  nicheSample,
} from "@/lib/website/niches";
import {
  firstValidationError,
  validateWebsiteConfig,
  type ValidationErrors,
} from "@/lib/website/validation";
import {
  GITPAGE_COLOR_SCHEMES,
  GITPAGE_DESIGN_BUTTONS,
  GITPAGE_DESIGN_COLOR_PALETTES,
  GITPAGE_DESIGN_COMPONENTS,
  GITPAGE_DESIGN_CONTACT_FORM,
  GITPAGE_DESIGN_ICONS,
  GITPAGE_DESIGN_INTERACTIONS,
  GITPAGE_DESIGN_LAYOUT,
  GITPAGE_DESIGN_TYPOGRAPHY,
  GITPAGE_LANGUAGES,
} from "@/lib/website/gitpage-values";

type BuildMode = "standard_local" | "standard_vsl" | "niche";

/**
 * One website card in the sub-account's list. Self-contained: holds its own
 * form state, manages collapse/expand, and submits build / re-check / rebuild
 * / remove against the per-site `/website/[siteId]/*` routes. The live `doc`
 * is owned by the parent page's collection subscription and passed down — this
 * component never subscribes to Firestore itself.
 */
export function WebsiteBuilder({
  subAccountId,
  doc,
  gateBlocked,
}: {
  subAccountId: string;
  doc: WebsiteDoc;
  /** True when the gitpage subscription is needed — Build + the form are hidden. */
  gateBlocked: boolean;
}) {
  const siteId = doc.id;
  const [config, setConfig] = useState<WebsiteConfig>(() => ({
    ...doc.config,
    build_type: doc.config.build_type ?? "local",
    video_link: doc.config.video_link ?? "",
  }));
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [urlShown, setUrlShown] = useState(false);

  const status = doc.status;
  const isLocked =
    status === "queued" || status === "building" || status === "ready";
  const isInFlight = status === "queued" || status === "building";
  const buildType: BuildType = config.build_type ?? "local";
  const niche: Niche | null = isNicheKey(config.niche) ? config.niche : null;

  // Re-sync the form from the server doc whenever a build / poll / reset moves
  // this site's status or job id. Keying on those primitives (not the doc
  // object identity) means a sibling card's build firing a collection snapshot
  // can't clobber unsaved edits to this draft. Editing never writes, so it
  // never re-syncs mid-typing.
  useEffect(() => {
    setConfig({
      ...doc.config,
      build_type: doc.config.build_type ?? "local",
      video_link: doc.config.video_link ?? "",
    });
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.status, doc.gitpageJobId, siteId]);

  const [mode, setMode] = useState<BuildMode>(() => {
    if (niche) return "niche";
    return buildType === "vsl" ? "standard_vsl" : "standard_local";
  });
  useEffect(() => {
    if (status !== "draft") return;
    if (niche) setMode("niche");
    else if (buildType === "vsl") setMode("standard_vsl");
    else setMode("standard_local");
  }, [status, niche, buildType]);

  const [expanded, setExpanded] = useState(
    () => status === "draft" || status === "failed",
  );
  useEffect(() => {
    if (status === "queued" || status === "building" || status === "ready") {
      setExpanded(false);
    } else if (status === "draft") {
      setExpanded(true);
    }
  }, [status]);

  function switchMode(next: BuildMode) {
    if (next === mode) return;
    setMode(next);
    setErrors({});
    if (next === "standard_local") {
      setConfig(blankWebsiteConfig());
    } else if (next === "standard_vsl") {
      setConfig(blankVslConfig());
    } else {
      setConfig({ ...blankWebsiteConfig(), niche: null });
    }
  }

  function selectNiche(key: Niche, asBuildType: BuildType) {
    const meta = NICHE_META[key];
    const base = asBuildType === "vsl" ? blankVslConfig() : blankWebsiteConfig();
    setConfig({
      ...base,
      niche: key,
      color_scheme: meta.defaultColorScheme,
      ...(asBuildType === "local"
        ? {
            local_page_selections: {
              index: true,
              services: true,
              contact: true,
              privacy: true,
              terms: true,
            },
            services_config: { let_ai_do_services: true, services_list: "" },
            business_details: blankBusinessDetails(),
          }
        : {}),
    });
    setErrors({});
  }

  function update<K extends keyof WebsiteConfig>(
    key: K,
    value: WebsiteConfig[K],
  ) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function togglePage(
    page: "services" | "contact" | "privacy" | "terms",
    next: boolean,
  ) {
    setConfig((prev) => {
      const sel = { ...prev.local_page_selections, [page]: next };
      const updated: WebsiteConfig = {
        ...prev,
        local_page_selections: sel,
      };
      if (page === "services") {
        updated.services_config = next
          ? prev.services_config ?? blankServicesConfig()
          : null;
      }
      if (page === "contact") {
        updated.business_details = next
          ? prev.business_details ?? blankBusinessDetails()
          : null;
      }
      return updated;
    });
  }

  function updateServices<K extends keyof WebsiteServicesConfig>(
    key: K,
    value: WebsiteServicesConfig[K],
  ) {
    setConfig((prev) =>
      prev.services_config
        ? {
            ...prev,
            services_config: { ...prev.services_config, [key]: value },
          }
        : prev,
    );
  }

  function updateBusiness<K extends keyof WebsiteBusinessDetails>(
    key: K,
    value: WebsiteBusinessDetails[K],
  ) {
    setConfig((prev) =>
      prev.business_details
        ? {
            ...prev,
            business_details: { ...prev.business_details, [key]: value },
          }
        : prev,
    );
  }

  function loadSample() {
    if (niche) {
      setConfig(nicheSample(niche, buildType)());
      toast.success(
        `Sample data loaded — ${NICHE_META[niche].label} ${buildType === "vsl" ? "VSL" : "site"}.`,
      );
    } else if (buildType === "vsl") {
      setConfig(sampleVslConfig());
      toast.success("Sample data loaded — coaching VSL.");
    } else {
      setConfig(sampleWebsiteConfig());
      toast.success("Sample data loaded — Starbucks Chadstone.");
    }
    setErrors({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validation = validateWebsiteConfig(config);
    setErrors(validation);
    const firstError = firstValidationError(validation);
    if (firstError) {
      toast.error(firstError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/website/${siteId}/build`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        },
      );
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        fieldErrors?: ValidationErrors;
      };
      if (!res.ok) {
        if (payload.fieldErrors) setErrors(payload.fieldErrors);
        throw new Error(payload.error ?? "Could not start build.");
      }
      toast.success("Build started — gitpage will let us know when it's live.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start build.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecheck() {
    setRechecking(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/website/${siteId}/poll-now`,
        { method: "POST" },
      );
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        settled?: "ready" | "failed" | "client-error";
      };
      if (!res.ok) throw new Error(payload.error ?? "Could not re-check.");
      if (payload.settled === "ready") {
        toast.success("Build is live — URL updated.");
      } else if (payload.settled === "failed") {
        toast.error("Build failed on gitpage's side.");
      } else if (payload.settled === "client-error") {
        toast.error("gitpage rejected the poll — check the error.");
      } else {
        toast.success("Still building — restarted the poll loop.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not re-check.");
    } finally {
      setRechecking(false);
    }
  }

  async function handleRebuild() {
    if (
      !confirm(
        "Reset to draft so you can edit and rebuild? The previous live site stays up until you delete the GitHub repo manually.",
      )
    )
      return;
    setResetting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/website/${siteId}?reset=1`,
        { method: "DELETE" },
      );
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Could not reset.");
      toast.success("Reset to draft. Edit the form and click Build site.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset.");
    } finally {
      setResetting(false);
    }
  }

  async function handleRemove() {
    if (
      !confirm(
        "Remove this website? This frees a slot so you can build a different one. Any already-published site stays live until you delete its GitHub repo manually.",
      )
    )
      return;
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/website/${siteId}`,
        { method: "DELETE" },
      );
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Could not remove.");
      toast.success("Website removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove.");
    } finally {
      setRemoving(false);
    }
  }

  const title = config.heading?.trim() || doc.name || "Untitled site";
  const liveUrl = doc.liveUrl;
  const accentClass =
    status === "ready"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : status === "failed"
        ? "border-rose-500/30 bg-rose-500/5"
        : isInFlight
          ? "border-amber-500/30 bg-amber-500/5"
          : "bg-card";

  return (
    <div className={`rounded-2xl border ${accentClass}`}>
      {/* Card header — always shown so the site is identifiable + collapsible
          in the list. */}
      <div className="flex items-center gap-3 p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded((v) => !v);
            }
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground">
            {expanded ? (
              <Minus className="h-3.5 w-3.5" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{title}</p>
            {status === "draft" && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Draft — not built yet
              </p>
            )}
            {isInFlight && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                {status === "queued"
                  ? "Build queued — gitpage is starting up…"
                  : "Building your site… (1–3 min)"}
              </p>
            )}
            {status === "ready" && liveUrl && (
              <div className="mt-0.5 flex items-center gap-2 text-xs">
                {urlShown ? (
                  <>
                    <a
                      href={liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-0 truncate text-primary hover:underline"
                    >
                      {liveUrl}
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUrlShown(false);
                      }}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      Hide
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">URL hidden</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUrlShown(true);
                      }}
                      className="shrink-0 text-primary hover:underline"
                    >
                      Show URL
                    </button>
                  </>
                )}
              </div>
            )}
            {status === "failed" && (
              <p className="mt-0.5 flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                <span className="line-clamp-2">
                  {doc.errorMessage ?? "gitpage didn't return a live URL."}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {isInFlight && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRecheck}
              disabled={rechecking}
            >
              {rechecking ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              {rechecking ? "Checking…" : "Re-check now"}
            </Button>
          )}
          {status === "ready" && liveUrl && (
            <Button
              type="button"
              size="sm"
              render={<a href={liveUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Visit
            </Button>
          )}
          {(status === "ready" || status === "failed") && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRebuild}
              disabled={resetting}
            >
              {resetting ? "Resetting…" : "Rebuild"}
            </Button>
          )}
          {!isInFlight && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRemove}
              disabled={removing}
              aria-label="Remove website"
              title="Remove website"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {doc.partialErrors && doc.partialErrors.length > 0 && (
        <div className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Some pages had issues during generation:
          </p>
          <ul className="mt-1 list-disc pl-5 text-[11px] text-amber-700/90 dark:text-amber-400/90">
            {doc.partialErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Form — hidden while the gitpage subscription is needed (Build would
          be rejected server-side anyway). */}
      {expanded && !gateBlocked && (
        <form onSubmit={handleSubmit} className="border-t p-4">
          <div className="relative">
            <fieldset disabled={isLocked || submitting} className="space-y-6">
              {(status === "draft" || status === "failed") && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      isLocked || submitting || (mode === "niche" && !niche)
                    }
                    onClick={loadSample}
                  >
                    Load sample data
                  </Button>
                </div>
              )}

              <Section
                title="Site type"
                description="Pick the kind of site to generate — switching clears the form."
              >
                <BuildModePicker
                  value={mode}
                  onChange={switchMode}
                  disabled={isLocked || submitting}
                />
              </Section>

              {mode === "niche" && !niche && (
                <Section
                  title="Pick your niche"
                  description="Each niche ships a research-backed design system, section structure, and copy tone. Click a tile to start filling in the details."
                >
                  <NicheTilePicker
                    onPick={selectNiche}
                    disabled={isLocked || submitting}
                  />
                </Section>
              )}

              {mode === "niche" && niche && (
                <Section
                  title="Niche template"
                  description="The design system, section structure, and copy tone are locked to this niche. Click change to pick a different one."
                >
                  <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl leading-none">
                        {NICHE_META[niche].emoji}
                      </span>
                      <div>
                        <p className="text-sm font-medium">
                          {NICHE_META[niche].label}
                          {" · "}
                          {buildType === "vsl" ? "VSL funnel" : "Site"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {NICHE_META[niche].description}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isLocked || submitting}
                      onClick={() => {
                        setConfig({ ...blankWebsiteConfig(), niche: null });
                        setErrors({});
                      }}
                    >
                      Change
                    </Button>
                  </div>
                </Section>
              )}

              {(mode !== "niche" || niche) && (
                <>
                  <Section
                    title="Basics"
                    description="The core message — what the site is and who it's for."
                  >
                    <div className="grid gap-4">
                      <Field
                        label="Heading"
                        hint="Max 80 characters."
                        error={errors.heading}
                      >
                        <Input
                          value={config.heading}
                          onChange={(e) => update("heading", e.target.value)}
                          maxLength={80}
                          placeholder={
                            buildType === "vsl"
                              ? "Scale Your Coaching To $30k/Month"
                              : "Acme Plumbing"
                          }
                        />
                      </Field>
                      <Field
                        label="Hero statement"
                        hint="Max 80 characters."
                        error={errors.hero_statement}
                      >
                        <Textarea
                          rows={2}
                          value={config.hero_statement}
                          onChange={(e) =>
                            update("hero_statement", e.target.value)
                          }
                          maxLength={80}
                          placeholder="24-hour emergency plumbing in Sydney"
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Language" error={errors.language}>
                          <Select
                            value={config.language}
                            onChange={(v) => update("language", v)}
                            options={GITPAGE_LANGUAGES}
                          />
                        </Field>
                        <Field
                          label="Color scheme"
                          error={errors.color_scheme}
                        >
                          <Select
                            value={config.color_scheme}
                            onChange={(v) =>
                              update(
                                "color_scheme",
                                v as WebsiteConfig["color_scheme"],
                              )
                            }
                            options={GITPAGE_COLOR_SCHEMES}
                          />
                        </Field>
                      </div>
                      <Field
                        label="Features"
                        hint="Comma-separated 3 short items. Max 60 chars total."
                        error={errors.features}
                      >
                        <Input
                          value={config.features}
                          onChange={(e) => update("features", e.target.value)}
                          maxLength={60}
                          placeholder="24/7 response, Licensed, Fixed-fee"
                        />
                      </Field>
                      <Field
                        label="Benefits"
                        hint="Comma-separated 3 short items. Max 60 chars total."
                        error={errors.benefits}
                      >
                        <Input
                          value={config.benefits}
                          onChange={(e) => update("benefits", e.target.value)}
                          maxLength={60}
                          placeholder="No surprises, Fast service, Guaranteed"
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Contact email"
                          error={errors.contact_details}
                        >
                          <Input
                            type="email"
                            value={config.contact_details}
                            onChange={(e) =>
                              update("contact_details", e.target.value)
                            }
                            placeholder="hello@acme.com"
                          />
                        </Field>
                        <Field
                          label="Call-to-action link"
                          error={errors.cta_link}
                        >
                          <Input
                            type="url"
                            value={config.cta_link}
                            onChange={(e) => update("cta_link", e.target.value)}
                            placeholder="https://book.acme.com"
                          />
                        </Field>
                      </div>
                    </div>
                  </Section>

                  {buildType === "vsl" && (
                    <Section
                      title="Video"
                      description="The VSL needs a video — paste the embed URL (not the watch URL)."
                    >
                      <Field
                        label="Video link"
                        hint="YouTube/Vimeo/Wistia embed URL. e.g. https://www.youtube.com/embed/dQw4w9WgXcQ"
                        error={errors.video_link}
                      >
                        <Input
                          type="url"
                          value={config.video_link}
                          onChange={(e) =>
                            update("video_link", e.target.value)
                          }
                          placeholder="https://www.youtube.com/embed/..."
                        />
                      </Field>
                    </Section>
                  )}

                  {buildType === "local" && !niche && (
                    <Section
                      title="Pages"
                      description="Which pages should the site include?"
                    >
                      <div className="space-y-2">
                        <PageRow
                          formId={siteId}
                          id="index"
                          label="Home (index.html)"
                          hint="Required"
                          disabled
                          checked
                        />
                        <PageRow
                          formId={siteId}
                          id="services"
                          label="Services (services.html)"
                          checked={config.local_page_selections.services}
                          onChange={(v) => togglePage("services", v)}
                        />
                        <PageRow
                          formId={siteId}
                          id="contact"
                          label="Contact (contact.html)"
                          checked={config.local_page_selections.contact}
                          onChange={(v) => togglePage("contact", v)}
                        />
                        <PageRow
                          formId={siteId}
                          id="privacy"
                          label="Privacy policy (privacy.html)"
                          checked={config.local_page_selections.privacy}
                          onChange={(v) => togglePage("privacy", v)}
                        />
                        <PageRow
                          formId={siteId}
                          id="terms"
                          label="Terms (terms.html)"
                          checked={config.local_page_selections.terms}
                          onChange={(v) => togglePage("terms", v)}
                        />
                      </div>
                    </Section>
                  )}

                  {buildType === "local" &&
                    config.local_page_selections.services &&
                    config.services_config && (
                      <Section
                        title="Services"
                        description={
                          niche
                            ? `Optional. Leave the toggle on to use the ${NICHE_META[niche].label} default services seed, or untick to provide your own.`
                            : "Used to populate the services.html page."
                        }
                      >
                        <div className="space-y-4">
                          <label className="flex items-center gap-3 rounded-lg border bg-background p-3">
                            <Checkbox
                              checked={config.services_config.let_ai_do_services}
                              onCheckedChange={(c) =>
                                updateServices("let_ai_do_services", c === true)
                              }
                            />
                            <div>
                              <p className="text-sm font-medium">
                                {niche
                                  ? "Use the niche default services seed"
                                  : "Let AI generate the services list"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {niche
                                  ? "Research-backed default for this niche (e.g. Plumbing / HVAC / Electrical / Roofing for Home Services). User-supplied services always win."
                                  : "gitpage writes services from your features + benefits."}
                              </p>
                            </div>
                          </label>
                          {!config.services_config.let_ai_do_services && (
                            <Field
                              label="Services list"
                              hint="Comma-separated."
                              error={errors["services_config.services_list"]}
                            >
                              <Textarea
                                rows={3}
                                value={config.services_config.services_list}
                                onChange={(e) =>
                                  updateServices("services_list", e.target.value)
                                }
                                placeholder="Dine-In, Takeout, Catering, Private Events"
                              />
                            </Field>
                          )}
                        </div>
                      </Section>
                    )}

                  {buildType === "local" &&
                    config.local_page_selections.contact &&
                    config.business_details && (
                      <Section
                        title="Business details"
                        description={
                          niche
                            ? "Required — niche templates ship contact.html with name, address, and phone."
                            : "Used to populate the contact.html page."
                        }
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field
                            label="Business name"
                            error={
                              errors["business_details.business_name"]
                            }
                          >
                            <Input
                              value={config.business_details.business_name}
                              onChange={(e) =>
                                updateBusiness("business_name", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Phone">
                            <Input
                              value={config.business_details.business_phone}
                              onChange={(e) =>
                                updateBusiness("business_phone", e.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label="Street"
                            error={
                              errors["business_details.business_street"]
                            }
                          >
                            <Input
                              value={config.business_details.business_street}
                              onChange={(e) =>
                                updateBusiness("business_street", e.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label="City"
                            error={errors["business_details.business_city"]}
                          >
                            <Input
                              value={config.business_details.business_city}
                              onChange={(e) =>
                                updateBusiness("business_city", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="State / region">
                            <Input
                              value={config.business_details.business_state}
                              onChange={(e) =>
                                updateBusiness("business_state", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Country">
                            <Input
                              value={config.business_details.business_country}
                              onChange={(e) =>
                                updateBusiness(
                                  "business_country",
                                  e.target.value,
                                )
                              }
                            />
                          </Field>
                          <Field label="Postcode / ZIP">
                            <Input
                              value={config.business_details.business_zip}
                              onChange={(e) =>
                                updateBusiness("business_zip", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Business email">
                            <Input
                              type="email"
                              value={config.business_details.business_email}
                              onChange={(e) =>
                                updateBusiness("business_email", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Google rating" hint="e.g. 4.8">
                            <Input
                              value={config.business_details.google_rating}
                              onChange={(e) =>
                                updateBusiness("google_rating", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Google review count" hint="e.g. 127">
                            <Input
                              value={
                                config.business_details.google_review_count
                              }
                              onChange={(e) =>
                                updateBusiness(
                                  "google_review_count",
                                  e.target.value,
                                )
                              }
                            />
                          </Field>
                          <div className="sm:col-span-2">
                            <Field
                              label="Opening hours"
                              hint='Free-text, e.g. "Mon-Fri 8-6, Sat 10-2".'
                            >
                              <Textarea
                                rows={2}
                                value={config.business_details.opening_hours}
                                onChange={(e) =>
                                  updateBusiness("opening_hours", e.target.value)
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      </Section>
                    )}

                  <Section
                    title="Design"
                    description="Pick a style — gitpage applies these consistently."
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Color palette"
                        error={errors.design_color_palette}
                      >
                        <Select
                          value={config.design_color_palette}
                          onChange={(v) => update("design_color_palette", v)}
                          options={GITPAGE_DESIGN_COLOR_PALETTES}
                        />
                      </Field>
                      {config.design_color_palette === "Custom" && (
                        <Field
                          label="Custom colours"
                          hint='Three hex values, e.g. "#5B4BFF,#EEF0FF,#00E5A8".'
                          error={errors.custom_colors}
                        >
                          <Input
                            value={config.custom_colors}
                            onChange={(e) =>
                              update("custom_colors", e.target.value)
                            }
                            placeholder="#5B4BFF,#EEF0FF,#00E5A8"
                          />
                        </Field>
                      )}
                      <Field label="Typography">
                        <Select
                          value={config.design_typography}
                          onChange={(v) => update("design_typography", v)}
                          options={GITPAGE_DESIGN_TYPOGRAPHY}
                        />
                      </Field>
                      <Field label="Layout">
                        <Select
                          value={config.design_layout}
                          onChange={(v) => update("design_layout", v)}
                          options={GITPAGE_DESIGN_LAYOUT}
                        />
                      </Field>
                      <Field label="Components">
                        <Select
                          value={config.design_components}
                          onChange={(v) => update("design_components", v)}
                          options={GITPAGE_DESIGN_COMPONENTS}
                        />
                      </Field>
                      <Field label="Interactions">
                        <Select
                          value={config.design_interactions}
                          onChange={(v) => update("design_interactions", v)}
                          options={GITPAGE_DESIGN_INTERACTIONS}
                        />
                      </Field>
                      <Field label="Buttons">
                        <Select
                          value={config.design_buttons}
                          onChange={(v) => update("design_buttons", v)}
                          options={GITPAGE_DESIGN_BUTTONS}
                        />
                      </Field>
                      <Field label="Contact form">
                        <Select
                          value={config.design_contact_form}
                          onChange={(v) => update("design_contact_form", v)}
                          options={GITPAGE_DESIGN_CONTACT_FORM}
                        />
                      </Field>
                      <Field label="Icons">
                        <Select
                          value={config.design_icons}
                          onChange={(v) => update("design_icons", v)}
                          options={GITPAGE_DESIGN_ICONS}
                        />
                      </Field>
                    </div>
                  </Section>

                  <Section
                    title="FAQ"
                    description="Optional auto-generated FAQ section."
                  >
                    <label className="flex items-center gap-3 rounded-lg border bg-background p-3">
                      <Checkbox
                        checked={config.include_faq}
                        onCheckedChange={(c) => update("include_faq", c === true)}
                      />
                      <div>
                        <p className="text-sm font-medium">Include FAQ section</p>
                        <p className="text-xs text-muted-foreground">
                          gitpage generates the questions and answers from your
                          features + benefits.
                        </p>
                      </div>
                    </label>
                  </Section>
                </>
              )}
            </fieldset>

            {isInFlight && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-background/60 backdrop-blur-[2px]">
                <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 shadow-md">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <p className="text-sm font-medium">Building your site…</p>
                </div>
              </div>
            )}
          </div>

          {(status === "draft" || status === "failed") && (
            <div className="mt-6 flex items-center justify-between rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-5">
              <div>
                <p className="text-sm font-medium">
                  {status === "failed" ? "Try the build again" : "Ready to build?"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Builds typically take 1–3 minutes. We&apos;ll show progress
                  here.
                </p>
              </div>
              <Button type="submit" disabled={submitting}>
                <Sparkles className="mr-1 h-4 w-4" />
                {submitting ? "Submitting…" : "Build site"}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <header className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<string>;
}) {
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function BuildModePicker({
  value,
  onChange,
  disabled,
}: {
  value: BuildMode;
  onChange: (next: BuildMode) => void;
  disabled?: boolean;
}) {
  const options: Array<{ id: BuildMode; label: string; hint: string }> = [
    {
      id: "standard_local",
      label: "Standard local site",
      hint: "Multi-page site — home, services, contact, terms.",
    },
    {
      id: "standard_vsl",
      label: "Standard VSL funnel",
      hint: "Single page with a video and one call-to-action.",
    },
    {
      id: "niche",
      label: "Niche template",
      hint: "Pre-designed for a specific trade — research-backed sections + copy tone.",
    },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            disabled={disabled}
            aria-pressed={selected}
            className={
              (selected
                ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                : "border-input bg-background hover:bg-muted/30") +
              " flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            <p className="text-sm font-medium">{opt.label}</p>
            <p className="text-[11px] text-muted-foreground">{opt.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

function NicheTilePicker({
  onPick,
  disabled,
}: {
  onPick: (niche: Niche, asBuildType: BuildType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Websites
        </p>
        {NICHE_KEYS.map((key) => (
          <NicheTile
            key={`${key}-local`}
            niche={key}
            buildType="local"
            disabled={disabled}
            onClick={() => onPick(key, "local")}
          />
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          VSL funnels
        </p>
        {NICHE_KEYS.map((key) => (
          <NicheTile
            key={`${key}-vsl`}
            niche={key}
            buildType="vsl"
            disabled={disabled}
            onClick={() => onPick(key, "vsl")}
          />
        ))}
      </div>
    </div>
  );
}

function NicheTile({
  niche,
  buildType,
  disabled,
  onClick,
}: {
  niche: Niche;
  buildType: BuildType;
  disabled?: boolean;
  onClick: () => void;
}) {
  const meta = NICHE_META[niche];
  const suffix = buildType === "vsl" ? " VSL" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-3 rounded-lg border border-input bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="text-2xl leading-none">{meta.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {meta.shortLabel}
          {suffix}
        </p>
        <p className="text-[11px] text-muted-foreground">{meta.description}</p>
      </div>
    </button>
  );
}

function PageRow({
  formId,
  id,
  label,
  hint,
  disabled,
  checked,
  onChange,
}: {
  /** Per-site namespace so duplicate ids don't collide across open cards. */
  formId: string;
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  checked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const domId = `page-${formId}-${id}`;
  return (
    <label
      htmlFor={domId}
      className={
        disabled
          ? "flex cursor-not-allowed items-center gap-3 rounded-lg border bg-muted/30 p-3 opacity-70"
          : "flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 hover:bg-muted/30"
      }
    >
      <Checkbox
        id={domId}
        disabled={disabled}
        checked={checked}
        onCheckedChange={(c) => onChange?.(c === true)}
      />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </label>
  );
}
