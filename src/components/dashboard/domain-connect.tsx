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
import type { WebsiteTransferDoc } from "@/types/website-transfer";
import {
  EMPTY_ONBOARDING_FOUNDATION,
  type BusinessSourcePlatform,
  type HostingStartingPoint,
  type OnboardingFoundation,
} from "@/types/onboarding-foundation";

/**
 * The three website situations an agent can be in, plus the CRM migration.
 *
 * The first three are ONE question — "what's the situation with your website?"
 * — and every agent is in exactly one of them. `switching` is deliberately not
 * a peer: it answers a different question (which CRM are you leaving?), and
 * mixing the two axes into one row of choices is a large part of why this
 * screen read as convoluted. It now sits below the three doors as its own
 * thing.
 *
 * `migrate` was previously buried as a sub-choice inside `existing` — an agent
 * had to pick "I have a website", then discover a second keep-or-move
 * question. Moving it up means the agent answers once and only sees the path
 * they chose.
 */
type Situation = "existing" | "migrate" | "new" | "switching";

/**
 * Hosts an agent is realistically already on. Values map to
 * BusinessSourcePlatform so the choice persists on the foundation record.
 */
/**
 * Every platform a business can arrive from, with the name we show the
 * operator and the URL that opens that platform's dashboard.
 *
 * ONE record, not two. The label list and the URL map used to be separate,
 * and they drifted: the URL map covered all 18 platforms while the label
 * list covered 9, so half the platforms rendered a button reading "Launch
 * your current host" instead of naming where it went. Keeping both on one
 * record makes that class of drift impossible — adding a platform to
 * `BusinessSourcePlatform` fails the build here until both halves exist.
 *
 * `dashboardUrl: null` means we have no dashboard to send them to and the
 * Launch button is not rendered.
 *
 * `pickable` marks the platforms offered in the "who hosts your site?"
 * picker. The others can still arrive as a `sourcePlatform` from onboarding
 * (where the question is which platform the BUSINESS runs on, not who hosts
 * the site) — they need a label for the button even though they are not
 * hosting choices.
 */
const HOST_PLATFORMS: Record<
  BusinessSourcePlatform,
  { label: string; dashboardUrl: string | null; pickable: boolean }
> = {
  wordpress: {
    label: "WordPress.com (hosted by WordPress)",
    dashboardUrl: "https://wordpress.com/home",
    pickable: true,
  },
  wordpress_selfhosted: {
    // The agent's site runs WordPress, but somebody else hosts it. We don't
    // know who, so we can't send them anywhere — and saying nothing is far
    // better than sending them to wordpress.com, which is not their host.
    label: "WordPress on another host",
    dashboardUrl: null,
    pickable: true,
  },
  hostinger: {
    // Hostinger is the migration and new-site partner promoted throughout
    // this product, yet it was missing from the list of hosts you could
    // actually select. An agent who took AgentStack's own recommendation
    // had no way to say so afterwards.
    label: "Hostinger",
    dashboardUrl: "https://hpanel.hostinger.com/websites",
    pickable: true,
  },
  siteground: {
    label: "SiteGround",
    dashboardUrl: "https://login.siteground.com/",
    pickable: true,
  },
  namecheap: {
    label: "Namecheap",
    dashboardUrl: "https://ap.www.namecheap.com/",
    pickable: true,
  },
  bluehost: {
    label: "Bluehost",
    dashboardUrl: "https://www.bluehost.com/my-account/login",
    pickable: true,
  },
  godaddy: {
    label: "GoDaddy",
    dashboardUrl: "https://sso.godaddy.com/",
    pickable: true,
  },
  wix: {
    label: "Wix",
    dashboardUrl: "https://manage.wix.com/",
    pickable: true,
  },
  squarespace: {
    label: "Squarespace",
    dashboardUrl: "https://account.squarespace.com/",
    pickable: true,
  },
  vercel: {
    label: "Vercel / Netlify",
    dashboardUrl: "https://vercel.com/dashboard",
    pickable: true,
  },
  gohighlevel: {
    label: "GoHighLevel",
    dashboardUrl: "https://app.gohighlevel.com/",
    pickable: true,
  },
  kvcore: {
    label: "kvCORE",
    dashboardUrl: "https://app.kvcore.com/",
    pickable: true,
  },
  followupboss: {
    label: "Follow Up Boss",
    dashboardUrl: "https://app.followupboss.com/",
    pickable: false,
  },
  lofty: {
    label: "Lofty",
    dashboardUrl: "https://www.lofty.com/login",
    pickable: false,
  },
  chime: {
    // Chime Technologies — the real-estate CRM/IDX platform — rebranded to
    // Lofty, so this points at the Lofty login. It previously pointed at
    // https://chime.aws/, which is Amazon's video-conferencing product and
    // has nothing to do with either real estate or website hosting.
    label: "Chime (now Lofty)",
    dashboardUrl: "https://www.lofty.com/login",
    pickable: false,
  },
  nextjs: {
    label: "Next.js on Vercel",
    dashboardUrl: "https://vercel.com/dashboard",
    pickable: false,
  },
  make: {
    // Region-agnostic entry point. Hardcoding us1 sent every EU tenant
    // (eu1/eu2) to a workspace they cannot log into.
    label: "Make",
    dashboardUrl: "https://www.make.com/en/login",
    pickable: false,
  },
  vibe: {
    label: "Vibe",
    dashboardUrl: null,
    pickable: false,
  },
  // Portal listings, not website hosts. An agent's site is never "hosted" on
  // Zillow, so there is no hosting dashboard to launch — sending them to the
  // consumer homepage was worse than showing nothing.
  zillow: { label: "Zillow", dashboardUrl: null, pickable: false },
  realtor: { label: "Realtor.com", dashboardUrl: null, pickable: false },
  homes: { label: "Homes.com", dashboardUrl: null, pickable: false },
  other: {
    label: "Another host",
    // We genuinely do not know where to send them, and a Launch button that
    // opens a web search is a dead end dressed up as an action.
    dashboardUrl: null,
    pickable: true,
  },
};

const EXISTING_HOSTS: Array<{ id: BusinessSourcePlatform; label: string }> = (
  Object.keys(HOST_PLATFORMS) as BusinessSourcePlatform[]
)
  .filter((id) => HOST_PLATFORMS[id].pickable)
  .map((id) => ({ id, label: HOST_PLATFORMS[id].label }));

const SITUATIONS: Array<{
  id: Situation;
  title: string;
  description: string;
  icon: typeof Globe;
}> = [
  {
    id: "new",
    title: "I don't have a website",
    description:
      "Bring a domain and external host; AgentStack helps you prepare the site content and business setup.",
    icon: PlusCircle,
  },
  {
    id: "existing",
    title: "I have one — keep it where it is",
    description:
      "Nothing moves. Tell us who hosts it and we'll connect it, check your DNS, and give you one-click access to your host.",
    icon: Globe,
  },
  {
    id: "migrate",
    title: "I have one — review it without moving",
    description:
      "Your current site stays live the whole time. We'll track the move through to a verified finish.",
    icon: Server,
  },
];

/**
 * The CRM migration. Kept off the row above on purpose: "what's the situation
 * with your website?" and "which CRM are you leaving?" are different
 * questions, and answering them in one control is what made this screen feel
 * like it was asking several things at once.
 */
const CRM_SWITCH_SITUATION = {
  id: "switching" as const,
  title: "I'm moving from another CRM",
  description:
    "Bring your contacts and deals across from GoHighLevel, kvCORE, Follow Up Boss and others.",
  icon: Building2,
};

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
  const [, setTransfer] = useState<WebsiteTransferDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    state: "live" | "points_elsewhere" | "no_records" | "unknown";
    detail: string;
    found?: { aRecords: string[]; cnames: string[] };
  } | null>(null);

  /**
   * Asks the server what the public internet actually reports for this
   * domain. Nothing here infers a result from what the agent told us — that
   * inference is what previously confirmed broken setups as correct.
   */
  async function verifyDomain() {
    setVerifying(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/domain/verify`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not check your domain.");
        return;
      }
      setVerifyResult(data);
      if (data.state === "live") toast.success(data.detail);
    } catch {
      toast.error(
        "Could not reach the domain checker. Check your connection and try again."
      );
    } finally {
      setVerifying(false);
    }
  }
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

  const domainSaved = Boolean(savedDomain.trim());
  const hostingConnected = Boolean(
    foundation.hostingStartingPoint && foundation.hostingSetupConfirmed
  );
  // Every platform has a label now, so the button names its destination
  // instead of falling back to "your current host". The fallback remains only
  // for a sourcePlatform that has not been set at all.
  const hostPlatform = foundation.sourcePlatform
    ? HOST_PLATFORMS[foundation.sourcePlatform]
    : undefined;
  const hostLabel = hostPlatform?.label ?? "your current host";
  const hostDashboardUrl = hostPlatform?.dashboardUrl ?? null;

  // AgentStack records and verifies an external host; it does not sell,
  // provide, transfer, or host customer websites.
  const hostingOptions: Array<{
    id: HostingStartingPoint;
    title: string;
    description: string;
  }> = [
    {
      id: "keep_existing",
      title: "Use my external host",
      description:
        "Keep your website with the hosting provider you already use. AgentStack only records the provider and checks DNS.",
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
      const selectedExternalHost =
        typeof document !== "undefined"
          ? (document.getElementById("existing-host") as HTMLSelectElement | null)
              ?.value
          : null;
      const externalHost =
        (selectedExternalHost as BusinessSourcePlatform | null) ?? existingHost;
      const next: OnboardingFoundation = {
        ...foundation,
        completed: true,
        mode: foundation.mode ?? (situation === "new" ? "fresh" : "transfer"),
        sourcePlatform:
          choice === "keep_existing"
            ? externalHost
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
        hostingSetupConfirmed: choice === "keep_existing",
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
      const savedFoundation = data.foundation ?? next;
      // Older deployments could return a foundation without the selected
      // external host even after accepting the PATCH. Preserve the exact
      // provider chosen in this screen so the UI never falls back to a
      // misleading generic label after a successful save.
      const persistedFoundation: OnboardingFoundation = {
        ...savedFoundation,
        sourcePlatform: savedFoundation.sourcePlatform ?? next.sourcePlatform,
      };
      setFoundation(persistedFoundation);
      if (persistedFoundation.sourcePlatform) {
        setExistingHost(persistedFoundation.sourcePlatform);
      }
      setHostChoice(choice);
      toast.success("External host connected.");
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

  /**
   * Setup is finished: a domain is saved and a host is connected.
   *
   * Once that is true, this screen has nothing left to ask. Plumbing is done
   * once and thereafter only OPENED — so collapse the whole walkthrough to a
   * single row with the one action that still matters, and keep the steps
   * available behind a disclosure for the rare time something changes.
   */
  const setupComplete = domainSaved && hostingConnected && !loading;
  const [showStepsAnyway, setShowStepsAnyway] = useState(false);

  if (setupComplete && !showStepsAnyway) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="bg-gradient-to-r from-[#173b7a] to-[#315f9d] p-6 text-white">
            <p className="text-xs font-semibold tracking-[0.18em] text-pink-200 uppercase">
              Website &amp; Domain
            </p>
            <h1 className="mt-2 text-2xl font-bold">
              {savedDomain || "Your domain"} is connected.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/85">
              Hosted by {hostLabel}. Nothing here needs your attention unless
              you&apos;re changing something.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 p-5">
            {hostDashboardUrl ? (
              <Button
                render={
                  <a
                    href={hostDashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Open {hostLabel}
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => void verifyDomain()}
              disabled={verifying}
            >
              {verifying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Check my domain
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowStepsAnyway(true)}
            >
              Change domain or external host
            </Button>
          </div>

          {verifyResult ? (
            <div className="border-t px-5 py-4">
              <p
                className={`text-sm font-medium ${
                  verifyResult.state === "live"
                    ? "text-emerald-700"
                    : verifyResult.state === "unknown"
                      ? "text-muted-foreground"
                      : "text-amber-700"
                }`}
              >
                {verifyResult.detail}
              </p>
            </div>
          ) : null}
        </section>
      </div>
    );
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
            Two steps: connect your domain and record your external host.
            AgentStack keeps the current website live and can check DNS, but
            does not provide hosting or change where your site is served.
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

        {/* A different question, and so a different control. Mixing "which CRM
            are you leaving?" into the row above meant the agent was choosing
            along two axes at once — and an agent moving from GoHighLevel who
            also has a website had to pick one and lose the other. */}
        <div className="border-t px-5 py-4">
          <button
            type="button"
            onClick={() => setSituation(CRM_SWITCH_SITUATION.id)}
            className={`flex w-full flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
              situation === CRM_SWITCH_SITUATION.id
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15"
                : "hover:border-blue-300 hover:bg-slate-50"
            }`}
          >
            <CRM_SWITCH_SITUATION.icon className="h-4 w-4 shrink-0 text-blue-700" />
            <span>
              <span className="text-sm font-medium">
                {CRM_SWITCH_SITUATION.title}
              </span>
              <span className="text-muted-foreground block text-xs leading-5">
                {CRM_SWITCH_SITUATION.description}
              </span>
            </span>
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="font-semibold">The public website stays untouched.</p>
            <p className="mt-1 text-xs leading-5">
              AgentStack does not host websites, proxy third-party sites,
              replace nameservers, alter email DNS, or publish automatically.
              We only record your external host and verify your domain.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="text-muted-foreground flex h-32 items-center justify-center rounded-2xl border">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading saved setup…
        </div>
      ) : situation === "existing" ||
        situation === "migrate" ||
        situation === "switching" ? (
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

      {/* AgentStack records an external host only. It does not offer hosting,
          hosting transfers, or a managed DNS cutover. */}
      {situation && !loading ? (
        <section className="rounded-2xl border bg-white p-6">
          <StepHeader
            step={2}
            state={
              hostingConnected ? "done" : domainSaved ? "active" : "locked"
            }
            title="Connect your host"
            description="Tell us which external provider serves this website. AgentStack does not provide or transfer hosting; it only records the provider and checks DNS."
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

              {hostingConnected ? (
                <div className="mt-4 space-y-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {`Connected to ${hostLabel}.`}
                  </p>
                  {foundation.hostingStartingPoint === "keep_existing" &&
                    hostDashboardUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <a
                          href={hostDashboardUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      Launch {hostLabel}
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {situation && !loading ? (
        <section className="rounded-2xl border bg-white p-6">
          <StepHeader
            step={3}
            state={verifyResult?.state === "live" ? "done" : domainSaved ? "active" : "locked"}
            title="Verify your domain"
            description={`AgentStack does not host websites or provide DNS cutover instructions. Your domain stays with your registrar and ${hostLabel} remains responsible for hosting.`}
          />

          {/* The real check. Available on both paths — an agent staying on
              their current host still deserves to confirm it, and that is
              exactly the case where a wrong dropdown answer used to be
              confirmed as correct. */}
          {domainSaved ? (
            <div className="mt-4 rounded-xl border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Check my domain</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Looks up your live DNS and tells you where it actually
                    points right now.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void verifyDomain()}
                  disabled={verifying}
                >
                  {verifying ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  {verifying ? "Checking…" : "Check my domain"}
                </Button>
              </div>

              {verifyResult ? (
                <div className="mt-3 border-t pt-3">
                  <p
                    className={`text-sm font-medium ${
                      verifyResult.state === "live"
                        ? "text-emerald-700"
                        : verifyResult.state === "unknown"
                          ? "text-muted-foreground"
                          : "text-amber-700"
                    }`}
                  >
                    {verifyResult.detail}
                  </p>
                  {/* Show the evidence rather than only a verdict, so the
                      agent can judge it — and so a wrong answer is visible
                      instead of authoritative. */}
                  {verifyResult.found &&
                  (verifyResult.found.aRecords.length > 0 ||
                    verifyResult.found.cnames.length > 0) ? (
                    <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                      Found:{" "}
                      {[
                        ...verifyResult.found.cnames.map(
                          (v) => `CNAME → ${v}`
                        ),
                        ...verifyResult.found.aRecords.map((v) => `A → ${v}`),
                      ].join("  ·  ")}
                    </p>
                  ) : null}
                  {verifyResult.state === "live" ? (
                    <Button
                      className="mt-3"
                      size="sm"
                      render={<a href={saPath("/business-profile")} />}
                    >
                      Continue to Business Blueprint
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <ul className="mt-4 space-y-2">
            <Requirement met={domainSaved} label="Domain saved" />
            <Requirement met={hostingConnected} label="External host recorded" />
          </ul>
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
            label="2 · External host"
            value={hostingConnected ? hostLabel : "Not recorded"}
            complete={hostingConnected}
          />
          <StatusCard
            label="3 · Domain check"
            value={verifyResult?.state === "live" ? "Verified" : domainSaved ? "Check available" : "Locked"}
            complete={verifyResult?.state === "live"}
          />
        </div>
      </section>
    </div>
  );
}
