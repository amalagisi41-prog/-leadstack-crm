"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  Loader2,
  RefreshCw,
  Sparkles,
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
  { value: "zillow", label: "Zillow" },
  { value: "realtor", label: "Realtor.com" },
  { value: "homes", label: "Homes.com" },
  { value: "other", label: "Another platform" },
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
  const [mode, setMode] = useState<OnboardingFoundationMode>("transfer");
  const [platform, setPlatform] =
    useState<BusinessSourcePlatform>("gohighlevel");
  const [sourceUrl, setSourceUrl] = useState("");
  const [domainPoint, setDomainPoint] =
    useState<DomainStartingPoint>("not_sure");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileImported, setProfileImported] = useState(false);

  async function importProfile() {
    if (!sourceUrl.trim()) {
      toast.error("Add your public website or business profile link first.");
      return;
    }
    setImporting(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/business-profile/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: sourceUrl, platform }),
        }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Could not read that link.");
      setProfileImported(true);
      toast.success("Business details imported as a draft for you to review.");
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
          <div className="mt-5 grid gap-3 sm:grid-cols-[220px_1fr_auto]">
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
            <input
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="Your website, Zillow, Realtor.com, or business profile link"
              className="bg-background rounded-lg border px-3 py-2 text-sm"
            />
            <Button type="button" onClick={importProfile} disabled={importing}>
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {profileImported ? "Import again" : "Import details"}
            </Button>
          </div>
          {profileImported ? (
            <p className="mt-3 text-sm font-medium text-emerald-700">
              Your draft is ready. Step 1 will let you review and correct every
              detail.
            </p>
          ) : null}
          {platform === "gohighlevel" ? (
            <div className="bg-muted/40 mt-4 rounded-xl border p-4 text-sm">
              <strong>Also moving contacts or conversation history?</strong> Use
              the secure{" "}
              <Link
                className="text-blue-700 underline"
                href={saPath("/import")}
              >
                GHL transfer tool
              </Link>{" "}
              after this setup.
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
              Keep a domain at GoDaddy, Bluehost, or another provider—AgentStack
              can connect it. If you need one, we will guide you without
              technical jargon.
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
