"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InstallSteps } from "@/components/pwa/install-steps";
import { useAppInstall } from "@/hooks/use-app-install";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";

/**
 * The install prompt shown once per sign-in until the app is actually
 * installed.
 *
 * It is a modal rather than a banner because the previous inline strip was
 * dismissed permanently on first sight and never seen again — most operators
 * never learned the app existed. It is also why nothing here silences the
 * prompt outright: dismissing snoozes, on a lengthening ladder, and the
 * sidebar entry plus the download page stay available in between.
 *
 * The preview uses the blue AgentStack tile used by the install/download
 * surfaces. The installed PWA icon remains controlled by the manifest.
 */
export function InstallPrompt() {
  const {
    shouldPrompt,
    platform,
    canInstallDirectly,
    manualOnly,
    install,
    snooze,
    markInstalled,
  } = useAppInstall();
  const [busy, setBusy] = useState(false);

  const brandName =
    LANDING_VARIANT === "custom" ? CUSTOM_BRAND.name : "AgentStack";

  if (!shouldPrompt) return null;

  async function onInstall() {
    setBusy(true);
    try {
      await install();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && snooze()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#173B7A] p-2 shadow-sm"
            >
              <Image
                src="/icons/logo-dark-192.png"
                alt=""
                width={56}
                height={56}
                className="h-full w-full object-contain"
                priority
              />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-left">
                Put {brandName} on your phone
              </DialogTitle>
              <DialogDescription className="text-left">
                One tap from your home screen — no URL to remember, and it opens
                full-screen like any other app.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {canInstallDirectly ? (
          <p className="text-sm leading-6 text-[#3C4A60]">
            Your browser can add it for you. This takes a few seconds and you
            can remove it at any time.
          </p>
        ) : (
          <InstallSteps platform={platform} brandName={brandName} />
        )}

        <div className="mt-1 flex flex-col gap-2">
          {canInstallDirectly ? (
            <Button
              onClick={onInstall}
              disabled={busy}
              className="w-full bg-[#173B7A] text-white hover:bg-[#244c8e]"
            >
              <Smartphone className="mr-2 h-4 w-4" />
              {busy ? "Opening installer…" : `Install ${brandName}`}
            </Button>
          ) : null}

          {manualOnly ? (
            // On iOS no event ever fires, so a self-report is the only way this
            // prompt can ever learn to stop.
            <Button
              variant="outline"
              className="w-full"
              onClick={markInstalled}
            >
              <Check className="mr-2 h-4 w-4" />
              I&rsquo;ve added it — don&rsquo;t ask again
            </Button>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button variant="ghost" size="sm" onClick={snooze}>
              Remind me later
            </Button>
            <Link
              href="/download"
              onClick={snooze}
              className="text-xs font-semibold text-[#173B7A] underline underline-offset-2"
            >
              Show me how on another device
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
