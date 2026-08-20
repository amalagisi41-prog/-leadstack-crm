"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, CheckCircle2, Copy, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallSteps } from "@/components/pwa/install-steps";
import { useAppInstall } from "@/hooks/use-app-install";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";
import type { InstallPlatform } from "@/lib/pwa/install-state";

const PLATFORM_LABEL: Record<InstallPlatform, string> = {
  ios: "On this iPhone or iPad",
  "safari-desktop": "In Safari on this Mac",
  chromium: "On this device",
  other: "On this device",
};

/**
 * The download page's working half.
 *
 * Deliberately leads with the steps for the device the reader is holding
 * rather than a platform picker: the person who lands here has already
 * skipped the prompt once, and making them self-identify as "iOS" before
 * seeing anything useful is how they leave again. The other platforms are
 * still listed underneath, because agents routinely set this up on a phone
 * while reading it on a laptop.
 */
export function DownloadPanel() {
  const {
    platform,
    canInstallDirectly,
    manualOnly,
    install,
    markInstalled,
    installed,
  } = useAppInstall();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const brandName =
    LANDING_VARIANT === "custom" ? CUSTOM_BRAND.name : "AgentStack";

  async function onInstall() {
    setBusy(true);
    try {
      await install();
    } finally {
      setBusy(false);
    }
  }

  async function copyInstallLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be denied in private or embedded browsers. Keep
      // the action harmless and let the user use the address bar instead.
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (installed) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="flex items-center gap-2 font-semibold text-emerald-900">
          <CheckCircle2 className="h-5 w-5" />
          {brandName} is installed on this device
        </p>
        <p className="mt-2 text-sm leading-6 text-emerald-900">
          Open it from your home screen or Dock. You will not be asked about
          this again here. To put it on another device, open this page on that
          device and follow the steps.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#173B7A] p-2 shadow-sm"
          >
            <Image
              src="/icons/logo-light-192.png"
              alt=""
              width={64}
              height={64}
              className="h-full w-full object-contain"
              priority
            />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#173B7A]">
              {PLATFORM_LABEL[platform]}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#526078]">
              This is the same {brandName} you are using now — installing puts
              it on your home screen and opens it full-screen, without the
              browser bars.
            </p>
          </div>
        </div>

        <div className="mt-5">
          {canInstallDirectly ? (
            <>
              <p className="text-sm leading-6 text-[#3C4A60]">
                Your browser can add it for you. It takes a few seconds, and you
                can remove it at any time the same way you remove any app.
              </p>
              <Button
                onClick={onInstall}
                disabled={busy}
                className="mt-3 bg-[#173B7A] text-white hover:bg-[#244c8e]"
              >
                <Smartphone className="mr-2 h-4 w-4" />
                {busy ? "Opening installer…" : `Install ${brandName}`}
              </Button>
            </>
          ) : (
            <InstallSteps platform={platform} brandName={brandName} />
          )}
        </div>

        {manualOnly ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={markInstalled}
          >
            <Check className="mr-2 h-4 w-4" />
            I&rsquo;ve added it — stop reminding me
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 text-[#526078]"
          onClick={copyInstallLink}
        >
          <Copy className="mr-2 h-4 w-4" />
          {copied ? "Install link copied" : "Copy install link for another device"}
        </Button>
      </div>

      <div className="rounded-2xl border bg-[#F8FAFC] p-6">
        <h3 className="text-sm font-semibold text-[#173B7A]">
          Setting it up on a different device
        </h3>
        <p className="mt-1 text-xs leading-5 text-[#526078]">
          Open this page on that device and the steps above will match it. For
          reference, all three:
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {(["ios", "chromium", "safari-desktop"] as const).map((p) => (
            <div key={p}>
              <p className="mb-2 text-xs font-semibold tracking-wide text-[#173B7A] uppercase">
                {p === "ios"
                  ? "iPhone / iPad"
                  : p === "chromium"
                    ? "Android / Chrome / Edge"
                    : "Safari on Mac"}
              </p>
              <InstallSteps platform={p} brandName={brandName} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
