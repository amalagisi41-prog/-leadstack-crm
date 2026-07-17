"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";

const DISMISSED_KEY = "agentstack:install-prompt-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Add to Home Screen" nudge for realtors on a phone. Mounted once in the
 * authenticated dashboard shell so every signed-in operator sees it (not
 * just during onboarding) -- but only on a small viewport, only when not
 * already installed, and only once (a dismissal is remembered forever).
 *
 * Two paths, since there's no unified browser API for this:
 *  - Android/Chrome fires `beforeinstallprompt`; we capture it and drive the
 *    native install flow from our own button.
 *  - iOS Safari never fires that event -- Apple only exposes the
 *    install flow through the manual Share -> Add to Home Screen sheet, so
 *    we show static instructions instead of a button there.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  // Onboarding wants full attention with no competing banners — checked at
  // render time (not just inside the mount effect below) so navigating in
  // or out of onboarding within the persisted dashboard layout reactively
  // hides/reveals the prompt instead of freezing whatever was true on
  // first mount.
  const isOnboarding = pathname?.includes("/get-started") ?? false;
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari's own non-standard flag for "already installed".
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
    if (!isSmallScreen) return;

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua);

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setPlatform("android");
      setDismissed(false);
    }

    if (isIos) {
      setPlatform("ios");
      setDismissed(false);
    } else {
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

  if (dismissed || !platform || isOnboarding) return null;

  const brandName =
    LANDING_VARIANT === "custom" ? CUSTOM_BRAND.name : "AgentStack";

  return (
    <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-sm md:hidden">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
        {platform === "ios" ? (
          <Share className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </span>
      <div className="flex-1">
        <p className="font-medium">Add {brandName} to your Home Screen</p>
        {platform === "ios" ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tap the Share button, then &quot;Add to Home Screen&quot; — opens
            full-screen like an app, no browser bar.
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            One tap gets you a home-screen icon that opens full-screen — no
            browser bar, no typing in a URL.
          </p>
        )}
        {platform === "android" && (
          <Button size="sm" className="mt-2 h-7 text-xs" onClick={install}>
            Install
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
