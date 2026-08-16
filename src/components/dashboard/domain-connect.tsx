"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  PlusCircle,
  Server,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openAskAssistant } from "@/components/dashboard/ask-assistant-panel";
import type { WebsiteTransferDoc } from "@/types/website-transfer";
import {
  EMPTY_ONBOARDING_FOUNDATION,
  type BusinessSourcePlatform,
  type HostingStartingPoint,
  type OnboardingFoundation,
} from "@/types/onboarding-foundation";

type Situation = "existing" | "new" | "switching";

const HOSTINGER_TRANSFER_URL =
  process.env.NEXT_PUBLIC_HOSTINGER_TRANSFER_URL ??
  "https://www.hostinger.com/";
const HOSTINGER_NEW_URL =
  process.env.NEXT_PUBLIC_HOSTINGER_NEW_SITE_URL ??
  "https://www.hostinger.com/";

/**
 * Hosts an agent is realistically already on. Values map to
 * BusinessSourcePlatform so the choice persists on the foundation record.
 */
const EXISTING_HOSTS: Array<{ id: BusinessSourcePlatform; label: string }> = [
  { id: "wordpress", label: "WordPress.com" },
  { id: "bluehost", label: "Bluehost" },
  { id: "godaddy", label: "GoDaddy" },
  { id: "wix", label: "Wix" },
  { id: "squarespace", label: "Squarespace" },
  { id: "vercel", label: "Vercel / Netlify" },
  { id: "gohighlevel", label: "GoHighLevel" },
  { id: "kvcore", label: "kvCORE" },
  { id: "other", label: "Another host" },
];

const SITUATIONS: Array<{
  id: Situation;
  title: string;
  description: string;
  icon: typeof Globe;
}> = [
  {
    id: "existing",
    title: "I have a website",
    description: "Keep it live while we track the hosting and transfer steps.",
    icon: Globe,
  },
  {
    id: "new",
    title: "I need a website",
    description: "Choose the domain path, then build in Website Studio.",
    icon: PlusCircle,
  },
  {
    id: "switching",
    title: "I’m switching CRMs",
    description: "Use a guided migration path for your current platform.",
    icon: Building2,
  },
];

function StatusCard({
  label,
  value,
  complete,
}: {
  label: string;
  value: string;
  complete: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
        {complete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        )}
        {value}
      </p>
    </div>
  );
}

/**
 * A numbered step in the Domain → Hosting → DNS walkthrough. The three steps
 * are always visible, including the ones that are not reachable yet, so the
 * flow reads as a route rather than dead-ending on whichever card happens to
 * be actionable.
 */
function StepHeader({
  step,
  title,
  description,
  state,
}: {
  step: number;
  title: string;
  description: string;
  state: "done" | "active" | "locked";
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          state === "done"
            ? "bg-emerald-600 text-white"
            : state === "active"
              ? "bg-blue-700 text-white"
              : "bg-slate-200 text-slate-500"
        }`}
      >
        {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : step}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {state === "locked" ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold">
              <Lock className="h-3 w-3" /> Locked
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 text-sm leading-5">
          {description}
        </p>
      </div>
    </div>
  );
}

/** One prerequisite line in the DNS gate, so "locked" says what is missing. */
function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {met ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-slate-300" />
      )}
      <span className={met ? "text-slate-700" : "text-muted-foreground"}>
        {label}
      </span>
    </li>
  );
}

export function DomainConnect() {
  const { subAccountId, subAccount, saPath } = useSubAccount();
  const [situation, setSituation] = useState<Situation | null>(null);
  const [domain, setDomain] = useState(subAccount?.customDomain ?? "");
  // Tracked separately from the input so step 2 unlocks on a persisted
  // domain, not on the first character typed into the field.
  const [savedDomain, setSavedDomain] = useState(
    subAccount?.customDomain ?? ""
  );
  const [currentSite, setCurrentSite] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("gohighlevel");
  const [transfer, setTransfer] = useState<WebsiteTransferDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // Hosting was previously unreachable: the status card read "Not started"
  // with no control to change it, so the flow dead-ended after the domain.
  const [foundation, setFoundation] = useState<OnboardingFoundation>(
    EMPTY_ONBOARDING_FOUNDATION
  );
  const [hostChoice, setHostChoice] = useState<HostingStartingPoint | null>(
    null
  );
  const [existingHost, setExistingHost] =
    useState<BusinessSourcePlatform>("wordpress");
  const [savingHosting, setSavingHosting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/sub-accounts/${subAccountId}/onboarding-foundation`)
      .then((response) => response.json())
      .then((data: { foundation?: OnboardingFoundation }) => {
        if (!active || !data.foundation) return;
        setFoundation(data.foundation);
        setHostChoice(data.foundation.hostingStartingPoint ?? null);
        if (data.foundation.sourcePlatform)
          setExistingHost(data.foundation.sourcePlatform);
        // The sub-account record is the source of truth for the domain; fall
        // back to the foundation for accounts saved before it was mirrored.
        if (!subAccount?.customDomain && data.foundation.domainName) {
          setDomain(data.foundation.domainName);
          setSavedDomain(data.foundation.domainName);
        }
      })
      .catch(() => undefined);
    fetch(`/api/sub-accounts/${subAccountId}/website-transfer`)
      .then((response) => response.json())
      .then((data: { transfer?: WebsiteTransferDoc | null }) => {
        if (!active) return;
        setTransfer(data.transfer ?? null);
        if (data.transfer?.sourceUrl) setCurrentSite(data.transfer.sourceUrl);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subAccountId, subAccount?.customDomain]);

  const hostingReady = Boolean(
    transfer?.hostingStatus === "ready" &&
    transfer.hostingUrl?.startsWith("https://")
  );
  const domainSaved = Boolean(savedDomain.trim());
  const hostingConnected = Boolean(
    foundation.hostingStartingPoint && foundation.hostingSetupConfirmed
  );
  const hostLabel =
    EXISTING_HOSTS.find((host) => host.id === foundation.sourcePlatform)
      ?.label ?? "your current host";

  /**
   * Only the choices that make sense for the selected situation. An agent
   * building their first site has nothing to transfer, and an agent with a
   * live site should not be offered a path that silently abandons it.
   */
  const hostingOptions: Array<{
    id: HostingStartingPoint;
    title: string;
    description: string;
  }> =
    situation === "new"
      ? [
          {
            id: "agentstack_managed",
            title: "Host with AgentStack",
            description:
              "We host and renew SSL for the site you build in Website Studio. Nothing else to buy.",
          },
          {
            id: "keep_existing",
            title: "I already have hosting",
            description:
              "Point AgentStack at the hosting account you already pay for.",
          },
        ]
      : [
          {
            id: "keep_existing",
            title: "Keep my current host",
            description:
              "Your site, IDX widgets, embeds, and keys stay exactly where they are.",
          },
          {
            id: "transfer_existing",
            title: "Move my site to a new host",
            description:
              "Hostinger migrates the existing site for free, then you finish setup here.",
          },
        ];

  /**
   * Persist the hosting choice on the onboarding foundation.
   *
   * The foundation PATCH replaces the whole object rather than merging, so
   * every field has to be resent — dropping one here would silently erase
   * domain or import progress the agent already completed.
   */
  async function saveHosting(choice: HostingStartingPoint) {
    setSavingHosting(true);
    try {
      const next: OnboardingFoundation = {
        ...foundation,
        completed: true,
        mode: foundation.mode ?? (situation === "new" ? "fresh" : "transfer"),
        sourcePlatform:
          choice === "keep_existing"
            ? existingHost
            : (foundation.sourcePlatform ??
              (situation === "switching"
                ? (sourcePlatform as BusinessSourcePlatform)
                : null)),
        sourceUrl: currentSite.trim() || foundation.sourceUrl,
        domainStartingPoint:
          foundation.domainStartingPoint ??
          (domainSaved ? "have_domain" : "need_domain"),
        domainName: savedDomain.trim() || foundation.domainName || "",
        domainSetupConfirmed: domainSaved || foundation.domainSetupConfirmed,
        hostingStartingPoint: choice,
        // "Move my site" is a handoff to the provider, so it is only confirmed
        // once the transfer record reports the hosted site is live.
        hostingSetupConfirmed:
          choice === "transfer_existing" ? hostingReady : true,
      };
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/onboarding-foundation`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        foundation?: OnboardingFoundation;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not save the hosting choice.");
      }
      setFoundation(data.foundation ?? next);
      setHostChoice(choice);
      toast.success(
        choice === "transfer_existing"
          ? "Transfer path saved. Finish the move with your provider."
          : "Hosting connected."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save hosting."
      );
    } finally {
      setSavingHosting(false);
    }
  }

  async function saveDomain() {
    const response = await fetch(`/api/sub-accounts/${subAccountId}/domain`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domain.trim() || null }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      domain?: string | null;
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error ?? "Could not save the domain.");
    setDomain(data.domain ?? "");
    setSavedDomain(data.domain ?? "");
    return data.domain ?? null;
  }

  async function saveExistingWebsite() {
    setSaving(true);
    try {
      await saveDomain();
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceUrl: currentSite,
            sourcePlatform:
              situation === "switching" ? sourcePlatform : "other",
          }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        transfer?: WebsiteTransferDoc;
        error?: string;
      };
      if (!response.ok || !data.transfer) {
        throw new Error(data.error ?? "Could not save the migration path.");
      }
      setTransfer(data.transfer);
      toast.success("Website and migration path saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNewDomain() {
    setSaving(true);
    try {
      await saveDomain();
      toast.success("Domain path saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function continueToTransfer() {
    if (!transfer) {
      toast.error("Save the current website address first.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request_hosting" }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        transfer?: WebsiteTransferDoc;
        error?: string;
      };
      if (!response.ok || !data.transfer) {
        throw new Error(data.error ?? "Could not start the hosting step.");
      }
      setTransfer(data.transfer);
      // Opened in a new tab rather than navigating away: the agent keeps their
      // place in the three-step flow and comes back to step 3 when the
      // provider is done.
      window.open(HOSTINGER_TRANSFER_URL, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start the transfer."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="bg-gradient-to-r from-[#173b7a] to-[#315f9d] p-6 text-white">
          <p className="text-xs font-semibold tracking-[0.18em] text-pink-200 uppercase">
            Website &amp; Domain
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            Tell us where you’re starting
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">
            Three steps: connect your domain, connect your host, then point
            DNS. AgentStack saves your progress, keeps the current website
            live, and unlocks DNS only after the hosted site is verified.
          </p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {SITUATIONS.map((item) => {
            const Icon = item.icon;
            const selected = situation === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSituation(item.id)}
                className={`rounded-2xl border p-5 text-left transition ${
                  selected
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15"
                    : "hover:border-blue-300 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-5 w-5 text-blue-700" />
                <p className="mt-3 font-semibold">{item.title}</p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {item.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="font-semibold">The public website stays untouched.</p>
            <p className="mt-1 text-xs leading-5">
              AgentStack does not proxy third-party sites, replace nameservers,
              alter email DNS, or publish automatically. We preview only the
              AgentStack-hosted site you are building.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="text-muted-foreground flex h-32 items-center justify-center rounded-2xl border">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading saved setup…
        </div>
      ) : situation === "existing" || situation === "switching" ? (
        <section className="rounded-2xl border bg-white p-6">
          <StepHeader
            step={1}
            state={domainSaved ? "done" : "active"}
            title="Connect your domain"
            description="Save the domain you already own and the address it points at today. We store the address and status only — the current site is not copied into an AgentStack iframe."
          />

          {situation === "switching" ? (
            <div className="mt-4">
              <label className="text-xs font-medium" htmlFor="source-platform">
                Current CRM
              </label>
              <select
                id="source-platform"
                value={sourcePlatform}
                onChange={(event) => setSourcePlatform(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm"
              >
                <option value="gohighlevel">GoHighLevel</option>
                <option value="kvcore">kvCORE</option>
                <option value="follow-up-boss">Follow Up Boss</option>
                <option value="other">Another platform</option>
              </select>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium" htmlFor="current-site">
                Current website address
              </label>
              <Input
                id="current-site"
                className="mt-1"
                value={currentSite}
                onChange={(event) => setCurrentSite(event.target.value)}
                placeholder="https://yourwebsite.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="current-domain">
                Domain you own
              </label>
              <Input
                id="current-domain"
                className="mt-1"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="yourwebsite.com"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={saveExistingWebsite} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save domain &amp; current site
            </Button>
            {sourcePlatform === "gohighlevel" && situation === "switching" ? (
              <Button variant="outline" render={<a href={saPath("/import")} />}>
                Open GHL import <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </section>
      ) : situation === "new" ? (
        <section className="rounded-2xl border bg-white p-6">
          <StepHeader
            step={1}
            state={domainSaved ? "done" : "active"}
            title="Connect your domain"
            description="Save the domain this site will live on. Register a new one with your provider first if you don’t own it yet — you can come back and save it here afterwards."
          />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="yournamehomes.com"
            />
            <Button onClick={saveNewDomain} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save domain
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button render={<a href={saPath("/website-studio/vibe")} />}>
              Open Website Studio <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              render={
                <a
                  href={HOSTINGER_NEW_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Register a domain at Hostinger
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center">
          <p className="font-semibold">Choose your situation above</p>
          <p className="text-muted-foreground mt-1 text-sm">
            You’ll get one short path and one next action.
          </p>
        </section>
      )}

      {/*
        Step 2 used to be a dead end: the status card said "Hosting — Not
        started" and the only control anywhere was an unlabeled Hostinger
        link, so an agent who already had a host had nothing to click. The
        three hosting choices below map onto HostingStartingPoint, which the
        onboarding foundation has always accepted.
      */}
      {situation && !loading ? (
        <section className="rounded-2xl border bg-white p-6">
          <StepHeader
            step={2}
            state={
              hostingConnected ? "done" : domainSaved ? "active" : "locked"
            }
            title="Connect your host"
            description="Tell us where this website is served from. Nothing moves or changes at your current host — this only records the path so DNS can be checked against it later."
          />

          {!domainSaved ? (
            <p className="text-muted-foreground mt-4 rounded-xl border border-dashed p-4 text-sm">
              Save your domain in step 1 first, then choose a host here.
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {hostingOptions.map((option) => {
                  const selected = hostChoice === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setHostChoice(option.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15"
                          : "hover:border-blue-300 hover:bg-slate-50"
                      }`}
                    >
                      <Server className="h-5 w-5 text-blue-700" />
                      <p className="mt-2 font-semibold">{option.title}</p>
                      <p className="text-muted-foreground mt-1 text-xs leading-5">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {hostChoice === "keep_existing" ? (
                <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                  <label className="text-xs font-medium" htmlFor="existing-host">
                    Who hosts it today?
                  </label>
                  <select
                    id="existing-host"
                    value={existingHost}
                    onChange={(event) =>
                      setExistingHost(
                        event.target.value as BusinessSourcePlatform
                      )
                    }
                    className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm sm:max-w-xs"
                  >
                    {EXISTING_HOSTS.map((host) => (
                      <option key={host.id} value={host.id}>
                        {host.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground mt-2 text-xs leading-5">
                    Your site, widgets, IDX embeds, and keys stay exactly where
                    they are. AgentStack only stores the provider name so Zack
                    can give you the right DNS instructions.
                  </p>
                  <Button
                    className="mt-3"
                    onClick={() => saveHosting("keep_existing")}
                    disabled={savingHosting}
                  >
                    {savingHosting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Connect this host
                  </Button>
                </div>
              ) : null}

              {hostChoice === "agentstack_managed" ? (
                <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                  <p className="text-sm leading-6">
                    AgentStack hosts the site you build in Website Studio,
                    including SSL. You keep the domain at your registrar and
                    point it here in step 3.
                  </p>
                  <Button
                    className="mt-3"
                    onClick={() => saveHosting("agentstack_managed")}
                    disabled={savingHosting}
                  >
                    {savingHosting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Host with AgentStack
                  </Button>
                </div>
              ) : null}

              {hostChoice === "transfer_existing" ? (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-semibold">
                    Hostinger — free website transfer
                  </p>
                  <p className="mt-1 text-xs leading-5 text-blue-900">
                    Hostinger moves your existing site for you, then you finish
                    here. This step opens Hostinger in a new tab because
                    providers do not all support embedding — your progress is
                    saved before you go.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      onClick={() => saveHosting("transfer_existing")}
                      disabled={savingHosting}
                      variant="outline"
                    >
                      {savingHosting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Save this path
                    </Button>
                    <Button onClick={continueToTransfer} disabled={saving}>
                      Start the transfer at Hostinger
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                  {!transfer ? (
                    <p className="mt-2 text-xs text-blue-900">
                      Save your current website address in step 1 before
                      starting the transfer.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {hostingConnected ? (
                <p className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {foundation.hostingStartingPoint === "agentstack_managed"
                    ? "Hosted by AgentStack."
                    : `Connected to ${hostLabel}.`}
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {situation && !loading ? (
        <section className="rounded-2xl border bg-white p-6">
          <StepHeader
            step={3}
            state={
              hostingReady ? "active" : hostingConnected ? "active" : "locked"
            }
            title="Point DNS"
            description="The last step connects the domain to the host. AgentStack never edits nameservers or email DNS for you — Zack walks you through the exact records to add at your registrar."
          />

          <ul className="mt-4 space-y-2">
            <Requirement met={domainSaved} label="Domain saved" />
            <Requirement met={hostingConnected} label="Host connected" />
            <Requirement
              met={hostingReady}
              label="Hosted site verified over HTTPS (required before record values are shown)"
            />
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant={hostingReady ? "default" : "outline"}
              disabled={!hostingConnected}
              onClick={() =>
                openAskAssistant({
                  prompt: hostingReady
                    ? `Walk me through pointing ${savedDomain || "my domain"} at my verified AgentStack site. Give me the exact DNS records to add at my registrar, one at a time, and tell me what to check after each one.`
                    : `My domain is ${savedDomain || "not saved yet"} and my host is ${hostLabel}. Explain what nameservers and DNS records I will need, what order to do them in, and what I have to finish before it is safe to change anything. Do not give me record values until my hosted site is verified.`,
                })
              }
            >
              {hostingReady
                ? "Get my DNS records from Zack"
                : "Ask Zack about nameservers & DNS"}
            </Button>
          </div>

          {!hostingReady ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              {hostingConnected
                ? "DNS record values stay hidden until hosting and SSL are verified, so a change can’t take your live site down mid-setup. Zack can still prepare you for the step."
                : "Finish step 2 to unlock DNS guidance."}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border bg-slate-50 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            label="1 · Domain"
            value={savedDomain || "Not saved"}
            complete={domainSaved}
          />
          <StatusCard
            label="2 · Hosting"
            value={
              hostingReady
                ? "Verified"
                : hostingConnected
                  ? foundation.hostingStartingPoint === "agentstack_managed"
                    ? "AgentStack"
                    : hostLabel
                  : transfer?.hostingStatus === "requested"
                    ? "Transfer started"
                    : "Not started"
            }
            complete={hostingConnected || hostingReady}
          />
          <StatusCard
            label="3 · DNS"
            value={
              hostingReady
                ? "Ready for review"
                : hostingConnected
                  ? "Waiting on verification"
                  : "Safely locked"
            }
            complete={hostingReady}
          />
        </div>
      </section>
    </div>
  );
}
