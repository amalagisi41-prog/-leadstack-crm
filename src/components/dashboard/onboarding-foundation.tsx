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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type {
  BusinessSourcePlatform,
  DomainStartingPoint,
  OnboardingFoundationMode,
} from "@/types/onboarding-foundation";

const platforms: { value: BusinessSourcePlatform; label: string }[] = [
  { value: "gohighlevel", label: "GoHighLevel (GHL)" },
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
  { label: "Buy a domain", detail: "Search a short .com name", href: "https://www.namecheap.com/domains/" },
  { label: "Open GoDaddy", detail: "Manage or transfer a GoDaddy domain", href: "https://dcc.godaddy.com/domains" },
  { label: "Open Bluehost", detail: "Manage WordPress and hosting", href: "https://my.bluehost.com/hosting/app" },
  { label: "Open WordPress", detail: "Export your existing website", href: "https://wordpress.com/me/purchases" },
  { label: "Open Vercel", detail: "Manage modern website hosting", href: "https://vercel.com/dashboard" },
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
        },
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not start transfer.");
      toast.success("Website transfer assessment started. Nothing will be published without approval.");
      window.location.assign(saPath("/import?source=ghl&website=queued"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start transfer.");
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
        const data = (await response.json()) as { error?: string };
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
            profileImported,
          }),
        }
      );
      const data = (await response.json()) as { error?: string };
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="rounded-2xl border bg-gradient-to-br from-[#1b3d7a] to-[#16305f] p-7 text-white shadow-sm">
        <p className="text-xs font-semibold tracking-[0.18em] text-pink-300 uppercase">
          Before Step 1
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          Start with what you already have.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-blue-100/90">
          AgentStack can bring over your public business details or help
          establish your domain and website. You do not need to understand
          hosting, DNS, or marketing software to get started.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {(
          [
            [
              "transfer",
              "Bring my business",
              "I already have a website, CRM, or public profile.",
            ],
            [
              "foundation",
              "Build my foundation",
              "Help me choose a domain and launch a website.",
            ],
            [
              "fresh",
              "Start fresh",
              "I will enter my details and decide on a website later.",
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
            <div className="rounded-xl border bg-background p-4">
              {platform === "gohighlevel" ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">Connect your GoHighLevel account</p>
                      <p className="text-muted-foreground mt-1 text-xs leading-5">
                        Sign in on HighLevel and choose the location you want to move.
                        AgentStack never asks for or stores your GHL password.
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
                          onChange={(event) => setTransferConsent(event.target.checked)}
                          className="mt-1 h-4 w-4"
                        />
                        <span>
                          <strong className="block text-[#173B7A]">
                            Allow a read-only migration assessment
                          </strong>
                          <span className="mt-1 block text-xs leading-5 text-[#526078]">
                            AgentStack may read the selected GHL location, website
                            structure, contacts, pipelines, fields, and approved assets
                            to prepare a transfer plan. Nothing is changed in GHL or
                            published in AgentStack without a separate approval.
                          </span>
                        </span>
                      </label>
                      <Button
                        type="button"
                        onClick={startGhlWebsiteTransfer}
                        disabled={!transferConsent || startingTransfer}
                      >
                        {startingTransfer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Start website transfer
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      onClick={() =>
                        window.location.assign(
                          `/api/sub-accounts/${subAccountId}/import/ghl/oauth/start`,
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
                  <Button type="button" onClick={importProfile} disabled={importing}>
                    {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
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
            <div className="bg-muted/40 mt-4 rounded-xl border p-4 text-xs leading-5 text-muted-foreground">
              Connection order: <strong className="text-foreground">log in</strong>
              {" → "}<strong className="text-foreground">choose a GHL location</strong>
              {" → "}<strong className="text-foreground">approve read-only access</strong>
              {" → "}<strong className="text-foreground">review the transfer plan</strong>.
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="bg-card rounded-2xl border p-6">
        <div className="flex items-start gap-3">
          <Globe2 className="mt-0.5 h-5 w-5 text-blue-600" />
          <div>
            <h2 className="font-semibold">Your domain and website</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Keep a domain or website at GoDaddy, Bluehost, Vercel, or another
              provider—AgentStack can connect it. If you need one, we will
              guide you without technical jargon.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["have_domain", "I already own a domain"],
              ["need_domain", "I need a new domain"],
              ["not_sure", "I’m not sure"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDomainPoint(value)}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${domainPoint === value ? "border-blue-500 bg-blue-50 font-medium dark:bg-blue-950/30" : "bg-background"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-xl border bg-muted/20 p-4">
          <p className="text-sm font-semibold">Go directly to the next step</p>
          <p className="mt-1 text-xs text-muted-foreground">These links open the provider at the closest available account, purchase, or transfer page. Return here after completing that step—AgentStack never asks for your provider password.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FOUNDATION_LINKS.filter((link) => domainPoint === "need_domain" ? link.label === "Buy a domain" : true).map((link) => <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border bg-background p-3 text-sm transition hover:border-blue-400">
              <span><span className="block font-medium">{link.label}</span><span className="block text-[11px] text-muted-foreground">{link.detail}</span></span><ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </a>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" render={<a href={saPath("/domain")} />}><ExternalLink className="mr-2 h-4 w-4" />Open AgentStack domain setup</Button>
            <Button type="button" variant="outline" render={<a href={saPath("/website-studio")} />}>Open managed Website Studio</Button>
          </div>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          Nothing will be transferred or published without your approval.
          Website Studio includes managed hosting when your new site is ready to
          go live.
        </p>
      </section>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={continueToSetup}
          disabled={saving || importing}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continue to the six-step setup <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
