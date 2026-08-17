"use client";

import Link from "next/link";
import { Smartphone } from "lucide-react";
import { useAppInstall } from "@/hooks/use-app-install";

/**
 * The persistent way back to the install, for anyone who skipped the prompt.
 *
 * Sits in the sidebar so the option is always one click away rather than
 * waiting for the next snooze to lapse. It disappears the moment the app is
 * installed — a sidebar telling someone to download what they are currently
 * running is the clearest possible sign nobody checked.
 */
export function InstallCallout() {
  const { showCallout } = useAppInstall();
  if (!showCallout) return null;

  return (
    <Link
      href="/download"
      className="flex min-h-11 items-center gap-2.5 rounded-md border border-white/25 bg-white/10 px-2 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6EA8FE] hover:text-[#102A4C]"
    >
      <Smartphone className="h-4 w-4 shrink-0" />
      <span className="flex-1">Get the app</span>
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full bg-[#F5736A]"
      />
    </Link>
  );
}
