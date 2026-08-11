"use client";

import { useEffect, useState } from "react";
import { Download, MonitorDown, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";

const DISMISSED_KEY = "agentstack:install-app-banner-dismissed:v2";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Install this app" nudge, mounted once in the authenticated dashboard
 * shell so every signed-in operator sees it (not just during onboarding) --
 * but only when not already installed. A dismissal is remembered for this
 * version of the banner so returning members are not repeatedly interrupted.
 *
 * Two paths, since there's no unified browser API for this:
 *  - Chromium (Chrome/Edge, on phone OR desktop) fires `beforeinstallprompt`;
 *    we capture it and drive the native install flow from our own button.
 *  - Apple browsers use their manual Share -> Add to Home Screen or
 *    File -> Add to Dock flows, so the banner gives device-specific steps.
 */
export function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<
    "chromium" | "ios" | "safari-desktop" | "browser" | null
  >(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari's own non-standard flag for "already installed".
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Edg|OPR/.test(ua);

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setPlatform("chromium");
      setDismissed(false);
    }

    // Show the banner immediately after signup. Chromium upgrades the action
    // to its native install prompt when `beforeinstallprompt` arrives.
    if (isIos) {
      setPlatform("ios");
      setDismissed(false);
    } else if (isSafari) {
      setPlatform("safari-desktop");
      setDismissed(false);
    } else {
      setPlatform("browser");
      setDismissed(false);
      window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    }

    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") dismiss();
    else dismiss();
  }

  if (dismissed || !platform) return null;

  const brandName =
    LANDING_VARIANT === "custom" ? CUSTOM_BRAND.name : "AgentStack";

  return (
    <div className="mx-4 mt-4 flex items-start gap-3 rounded-2xl border border-[#AFC7EA] bg-[#EDF5FF] p-4 text-sm shadow-sm">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#173B7A] text-white">
        {platform === "ios" ? (
          <Smartphone className="h-5 w-5" />
        ) : platform === "safari-desktop" ? (
          <MonitorDown className="h-5 w-5" />
        ) : (
          <Download className="h-5 w-5" />
        )}
      </span>
      <div className="flex-1">
        <p className="font-semibold text-[#173B7A]">
          Get the {brandName} app on this device
        </p>
        {platform === "ios" ? (
          <p className="mt-1 text-xs leading-5 text-[#526078]">
            Tap <Share className="mx-0.5 inline h-3.5 w-3.5" /> Share, then
            &quot;Add to Home Screen.&quot; AgentStack will open like an app from
            your phone or iPad.
          </p>
        ) : platform === "safari-desktop" ? (
          <p className="mt-1 text-xs leading-5 text-[#526078]">
            In Safari, choose File → Add to Dock to keep AgentStack in your
            Dock and open it like a desktop app.
          </p>
        ) : platform === "browser" ? (
          <p className="mt-1 text-xs leading-5 text-[#526078]">
            Use your browser menu and choose &quot;Install AgentStack&quot; or
            &quot;Create shortcut.&quot; The Install button will appear here when your
            browser is ready.
          </p>
        ) : (
          <p className="mt-1 text-xs leading-5 text-[#526078]">
            Add AgentStack to your desktop or home screen for one-tap access,
            with no URL to remember.
          </p>
        )}
        {platform === "chromium" && (
          <Button
            size="sm"
            className="mt-2 h-8 bg-[#173B7A] text-xs text-white hover:bg-[#244c8e]"
            onClick={install}
          >
            Install app
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-[#65758D] hover:text-[#173B7A]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
