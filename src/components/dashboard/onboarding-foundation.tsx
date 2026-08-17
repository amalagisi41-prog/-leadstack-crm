"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  ArrowUpRight,
  CreditCard,
  Server,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type {
  BusinessSourcePlatform,
  DomainStartingPoint,
  HostingStartingPoint,
  OnboardingFoundationMode,
} from "@/types/onboarding-foundation";
import { readJson } from "@/lib/http/read-json";

const platforms: { value: BusinessSourcePlatform; label: string }[] = [
  { value: "gohighlevel", label: "GoHighLevel (GHL)" },
  { value: "followupboss", label: "Follow Up Boss" },
  { value: "kvcore", label: "kvCORE" },
  { value: "lofty", label: "Lofty" },
  { value: "chime", label: "Chime" },
  { value: "wordpress", label: "WordPress" },
  { value: "bluehost", label: "Bluehost" },
  { value: "godaddy", label: "GoDaddy" },
  { value: "wix", label: "Wix" },
  { value: "squarespace", label: "Squarespace" },
  { value: "vercel", label: "Vercel" },
  { value: "nextjs", label: "Next.js website" },
  { value: "make", label: "Make automation" },
  { value: "vibe", label: "Vibe.co website builder" },
  { value: "zillow", label: "Zillow" },
  { value: "realtor", label: "Realtor.com" },
  { value: "homes", label: "Homes.com" },
  { value: "other", label: "Another platform" },
];

const FOUNDATION_LINKS = [
  {
    label: "Buy a domain",
    detail: "Search a short .com name",
    href: "https://www.namecheap.com/domains/",
  },
  {
    label: "Open GoDaddy",
    detail: "Manage or transfer a GoDaddy domain",
    href: "https://dcc.godaddy.com/domains",
  },
  {
    label: "Open Bluehost",
    detail: "Manage WordPress and hosting",
    href: "https://my.bluehost.com/hosting/app",
  },
  {
    label: "Open WordPress",
    detail: "Export your existing website",
    href: "https://wordpress.com/me/purchases",
  },
  {
    label: "Open Vercel",
    detail: "Manage modern website hosting",
    href: "https://vercel.com/dashboard",
  },
];

export function OnboardingFoundation({
  subAccountId,
  saPath,
  onComplete,
}: {
  subAccountId: string;
  saPath: (path: string) => string;
  onComplete: () => void;
}) {
  const searchParams = useSearchParams();
  const ghlStatus = searchParams.get("ghl");
  const [mode, setMode] = useState<OnboardingFoundationMode>("transfer");
  const [platform, setPlatform] =
    useState<BusinessSourcePlatform>("gohighlevel");
  const [sourceUrl, setSourceUrl] = useState("");
  const [domainPoint, setDomainPoint] =
    useState<DomainStartingPoint>("not_sure");
  const [hostingPoint, setHostingPoint] =
    useState<HostingStartingPoint>("agentstack_managed");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileImported, setProfileImported] = useState(false);
  const [transferConsent, setTransferConsent] = useState(false);
  const [startingTransfer, setStartingTransfer] = useState(false);

  async function startGhlWebsiteTransfer() {
    if (!transferConsent) {
      toast.error("Approve read-only access before starting the transfer.");
      return;
    }
    setStartingTransfer(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/import/ghl/website-transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consent: true }),
        }
      );
      const data = await readJson<{ ok?: boolean }>(response);
      if (!response.ok)
        throw new Error(data.error ?? "Could not start transfer.");
      toast.success(
        "Website transfer assessment started. Nothing will be published without approval."
      );
      window.location.assign(saPath("/import?source=ghl&website=queued"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start transfer."
      );
      setStartingTransfer(false);
    }
  }

  async function importProfile() {
    const urls = (sourceUrl.match(/https?:\/\/[^\s]+/gi) ?? []).map((url) =>
      url.replace(/[),.;]+$/g, "")
    );
    if (urls.length === 0) {
      toast.error("Add your public website or business profile link first.");
      return;
    }
    if (urls.length > 5) {
      toast.error("Import up to five public profile links at a time.");
      return;
    }
    setImporting(true);
    try {
      let imported = 0;
      let lastError = "";
      for (const url of urls) {
        const response = await fetch(
          `/api/sub-accounts/${subAccountId}/business-profile/import`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, platform }),
          }
        );
        const data = await readJson<{ ok?: boolean }>(response);
        if (response.ok) imported += 1;
        else lastError = data.error ?? "Could not read that link.";
      }
      if (imported === 0)
        throw new Error(lastError || "Could not read those links.");
      setProfileImported(true);
      toast.success(
        `${imported} ${imported === 1 ? "page" : "pages"} imported with Claude as a draft for you to review.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function continueToSetup() {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/onboarding-foundation`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            sourcePlatform: mode === "transfer" ? platform : null,
            sourceUrl: mode === "transfer" ? sourceUrl : "",
            domainStartingPoint: domainPoint,
            hostingStartingPoint: hostingPoint,
            domainSetupConfirmed: false,
            hostingSetupConfirmed: false,
            profileImported,
          }),
        }
      );
      const data = await readJson<{ ok?: boolean }>(response);
      if (!response.ok)
        throw new Error(data.error ?? "Could not save your choice.");
      onComplete();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not continue."
      );
    } finally {
      setSaving(false);
    }
  }

  const buildSteps = [
    { label: "Domain", done: domainPoint !== "not_sure" },
    { label: "Hosting", done: Boolean(hostingPoint) },
    {
      label: "Business source",
      done:
        mode !== "transfer" || platform === "gohighlevel"
          ? ghlStatus === "connected" || mode !== "transfer"
          : Boolean(sourceUrl),
    },
    { label: "Blueprint", done: profileImported || mode !== "transfer" },
  ];
  const buildPercent = Math.round(
    (buildSteps.filter((step) => step.done).length / buildSteps.length) * 100
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="rounded-2xl border bg-gradient-to-br from-[#1b3d7a] to-[#16305f] p-7 text-white shadow-sm">
        <p className="text-xs font-semibold tracking-[0.18em] text-pink-300 uppercase">
          Build as you go
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          Start with your digital foundation.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-blue-100/90">
          Choose your domain and hosting first. AgentStack then builds visibly
          alongside you while Zack carries each approved answer into your
          Business Blueprint. No DNS or marketing-software experience needed.
        </p>
      </div>

      <section className="bg-card rounded-2xl border p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Your build is in progress</p>
            <p className="text-muted-foreground text-sm">
              Complete one small decision at a time. You can work in AgentStack
              while the site is prepared.
            </p>
          </div>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
            {buildPercent}%
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {buildSteps.map((step, index) => (
            <div
              key={step.label}
              className={`rounded-xl border p-3 text-sm ${step.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-muted/20 text-muted-foreground"}`}
            >
              <span className="mr-2 font-semibold">{index + 1}</span>
              {step.label}
              {step.done ? (
                <CheckCircle2 className="ml-2 inline h-4 w-4" />
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-card rounded-2xl border p-6">
        <div className="flex items-start gap-3">
          <Globe2 className="mt-0.5 h-5 w-5 text-blue-600" />
          <div>
            <p className="text-xs font-semibold tracking-widest text-pink-500 uppercase">
              Foundation · Step 1
            </p>
            <h2 className="mt-1 font-semibold">
              Choose your domain starting point
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Buy a domain, connect one you own, or let Zack guide the choice.
              Nothing changes until you approve it.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["have_domain", "I already own a domain"],
              ["need_domain", "Buy a new domain"],
              ["not_sure", "Help me choose"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setDomainPoint(value);
                if (value === "have_domain")
                  setHostingPoint("transfer_existing");
              }}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${domainPoint === value ? "border-blue-500 bg-blue-50 font-medium" : "bg-background"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {domainPoint === "need_domain" ? (
            <Button
              render={
                <a
                  href="https://www.namecheap.com/domains/"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <ArrowUpRight className="mr-2 h-4 w-4" />
              Search and buy a domain
            </Button>
          ) : null}
          <Button variant="outline" render={<a href={saPath("/domain")} />}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open domain setup
          </Button>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {(
          [
            [
              "transfer",
              "Replace my existing site",
              "AgentStack reproduces the current design and code, then brings over approved CRM, contact, and brand details.",
            ],
            [
              "foundation",
              "Build a new business",
              "Watch AgentStack and Zack prepare the site and digital foundation.",
            ],
            [
              "fresh",
              "Build the basics first",
              "Start working now and complete connections as the business grows.",
            ],
          ] as const
        ).map(([value, title, description]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-2xl border p-5 text-left transition ${
              mode === value
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/30"
                : "bg-card hover:border-blue-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{title}</span>
              {mode === value ? (
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              ) : null}
            </div>
            <p className="text-muted-foreground mt-2 text-sm">{description}</p>
          </button>
        ))}
      </div>

      {mode === "transfer" ? (
        <section className="bg-card rounded-2xl border p-6">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-pink-500" />
            <div>
              <h2 className="font-semibold">
                Let AI prepare your Business Blueprint
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Choose where you are coming from and paste a public page.
                AgentStack copies only facts it can verify and leaves them as a
                draft for your approval.
              </p>
              <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-[#173b7a]">
                Your public website stays live while the provider transfer is
                tracked. AgentStack does not proxy that site into the editor;
                Website Studio previews only the site AgentStack hosts.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-[220px_1fr]">
            <select
              aria-label="Current platform"
              value={platform}
              onChange={(event) =>
                setPlatform(event.target.value as BusinessSourcePlatform)
              }
              className="bg-background rounded-lg border px-3 py-2 text-sm"
            >
              {platforms.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <div className="bg-background rounded-xl border p-4">
              {platform === "gohighlevel" ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">
                        Connect your GoHighLevel account
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs leading-5">
                        Sign in on HighLevel and choose the location you want to
                        move. AgentStack never asks for or stores your GHL
                        password.
                      </p>
                    </div>
                    {ghlStatus === "connected" ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                      </span>
                    ) : null}
                  </div>

                  {ghlStatus === "connected" ? (
                    <>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={transferConsent}
                          onChange={(event) =>
                            setTransferConsent(event.target.checked)
                          }
                          className="mt-1 h-4 w-4"
                        />
                        <span>
                          <strong className="block text-[#173B7A]">
                            Allow a read-only migration assessment
                          </strong>
                          <span className="mt-1 block text-xs leading-5 text-[#526078]">
                            AgentStack may read the selected GHL location,
                            website structure, contacts, pipelines, fields, and
                            approved assets to prepare a transfer plan. Nothing
                            is changed in GHL or published in AgentStack without
                            a separate approval.
                          </span>
                        </span>
                      </label>
                      <Button
                        type="button"
                        onClick={startGhlWebsiteTransfer}
                        disabled={!transferConsent || startingTransfer}
                      >
                        {startingTransfer ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Start website transfer
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      onClick={() =>
                        window.location.assign(
                          `/api/sub-accounts/${subAccountId}/import/ghl/oauth/start`
                        )
                      }
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Log in to GoHighLevel
                    </Button>
                  )}
                  {ghlStatus === "not_configured" ? (
                    <p className="text-xs text-amber-700">
                      The AgentStack HighLevel app credentials still need to be
                      connected by the platform administrator.
                    </p>
                  ) : ghlStatus === "error" || ghlStatus === "bad_state" ? (
                    <p className="text-xs text-red-600">
                      HighLevel could not be connected. Please try again.
                    </p>
                  ) : ghlStatus === "cancelled" ? (
                    <p className="text-xs text-amber-700">
                      Connection canceled. No GHL data was accessed.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="Paste one or more website or public profile links"
                    className="bg-background rounded-lg border px-3 py-2 text-sm"
                  />
                  <Button
                    type="button"
                    onClick={importProfile}
                    disabled={importing}
                  >
                    {importing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {profileImported ? "Import again" : "Import details"}
                  </Button>
                </div>
              )}
            </div>
          </div>
          {profileImported ? (
            <p className="mt-3 text-sm font-medium text-emerald-700">
              Your draft is ready. Step 1 will let you review and correct every
              detail.
            </p>
          ) : null}
          {platform === "gohighlevel" ? (
            <div className="bg-muted/40 text-muted-foreground mt-4 rounded-xl border p-4 text-xs leading-5">
              Connection order:{" "}
              <strong className="text-foreground">log in</strong>
              {" → "}
              <strong className="text-foreground">choose a GHL location</strong>
              {" → "}
              <strong className="text-foreground">
                approve read-only access
              </strong>
              {" → "}
              <strong className="text-foreground">
                review the transfer plan
              </strong>
              .
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="bg-card rounded-2xl border p-6">
        <div className="flex items-start gap-3">
          <Server className="mt-0.5 h-5 w-5 text-blue-600" />
          <div>
            <p className="text-xs font-semibold tracking-widest text-pink-500 uppercase">
              Foundation · Step 2
            </p>
            <h2 className="mt-1 font-semibold">
              Choose how AgentStack hosts the build
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Use managed hosting for the simplest setup, transfer an existing
              site, or keep your current host while AgentStack connects it.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["agentstack_managed", "Managed by AgentStack"],
              ["transfer_existing", "Transfer my hosting"],
              ["keep_existing", "Keep my current host"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setHostingPoint(value)}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${hostingPoint === value ? "border-blue-500 bg-blue-50 font-medium dark:bg-blue-950/30" : "bg-background"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="bg-muted/20 mt-4 rounded-xl border p-4">
          <p className="text-sm font-semibold">Open the exact provider step</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Sign in with the provider directly. AgentStack never asks for or
            stores a provider password.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FOUNDATION_LINKS.filter(
              (link) =>
                hostingPoint !== "agentstack_managed" ||
                link.label === "Open Vercel"
            ).map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="bg-background flex items-center justify-between rounded-lg border p-3 text-sm transition hover:border-blue-400"
              >
                <span>
                  <span className="block font-medium">{link.label}</span>
                  <span className="text-muted-foreground block text-[11px]">
                    {link.detail}
                  </span>
                </span>
                <ArrowUpRight className="text-muted-foreground h-4 w-4" />
              </a>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              render={<a href={saPath("/domain")} />}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open AgentStack domain setup
            </Button>
            <Button
              type="button"
              variant="outline"
              render={<a href={saPath("/website-studio")} />}
            >
              Open managed Website Studio
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          Nothing is transferred or published without approval. Managed hosting
          is prepared while you continue using AgentStack.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="bg-card rounded-2xl border p-5">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <p className="font-semibold">Website Studio</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Build and preview the AgentStack-hosted site without leaving
                your workspace.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              render={<a href={saPath("/website-studio")} />}
            >
              Open Studio
            </Button>
          </div>
          <div className="flex h-64 flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-pink-50 p-8 text-center">
            <Sparkles className="h-8 w-8 text-pink-500" />
            <p className="mt-3 font-semibold">Your private build starts here</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
              Choose a ready-made real-estate site or describe the design to
              Zack. The preview and public renderer use the same structured
              AgentStack site.
            </p>
            <Button
              className="mt-4"
              size="sm"
              render={<a href={saPath("/website-studio")} />}
            >
              Open Website Studio
            </Button>
          </div>
        </div>
        <div className="bg-card rounded-2xl border p-5">
          <CreditCard className="h-5 w-5 text-blue-600" />
          <h2 className="mt-3 font-semibold">Secure payment readiness</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Your subscription card is stored securely by Stripe—not
            AgentStack—so approved domain, hosting, and future add-on purchases
            can move faster.
          </p>
          <Button
            className="mt-4 w-full"
            variant="outline"
            render={<a href={saPath("/dashboard/settings")} />}
          >
            Review billing settings
          </Button>
          <p className="text-muted-foreground mt-3 text-xs">
            No add-on is charged without a clear price and your approval.
          </p>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={continueToSetup}
          disabled={saving || importing}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save foundation and keep building{" "}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
