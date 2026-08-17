import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bell, Wifi, Zap } from "lucide-react";
import { DownloadPanel } from "@/components/pwa/download-panel";
import { LogoMark } from "@/components/brand/logo-mark";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";

const brandName =
  LANDING_VARIANT === "custom" ? CUSTOM_BRAND.name : "AgentStack";

export const metadata: Metadata = {
  title: `Get the ${brandName} app`,
  description: `Install ${brandName} on your phone, tablet, or desktop. One tap from your home screen — no app store, no download to manage.`,
};

/**
 * The page anyone lands on after skipping the install prompt — reachable from
 * the sidebar, from the prompt itself, and publicly, so it also serves as the
 * marketing site's "get the app" destination.
 *
 * Public on purpose: a prospect deciding whether this runs on their phone
 * should not have to sign up first to find out, and an agent setting it up on
 * a second device is often not signed in on that device yet.
 */
export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-[#FBFCFE] font-sans">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#526078] hover:text-[#173B7A]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <LogoMark size={32} idSuffix="-download" className="h-8 w-8" />
          <h1 className="text-2xl font-bold tracking-tight text-[#173B7A] sm:text-3xl">
            Get the {brandName} app
          </h1>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#526078]">
          There is no app store download and nothing to update. {brandName}{" "}
          installs straight from your browser in about ten seconds, and lives on
          your home screen like any other app.
        </p>

        <div className="mt-8">
          <DownloadPanel />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              Icon: Zap,
              title: "Opens instantly",
              body: "Straight to your dashboard, full-screen, with no address bar and no URL to remember.",
            },
            {
              Icon: Bell,
              title: "Made for showings",
              body: "Check a lead, log a note, or confirm a time from the car without hunting for a tab.",
            },
            {
              Icon: Wifi,
              title: "Survives a weak signal",
              body: "Opens and tells you what is happening on a bad connection instead of showing a browser error.",
            },
          ].map(({ Icon, title, body }) => (
            <div key={title} className="rounded-2xl border bg-white p-4">
              <Icon className="h-5 w-5 text-[#DB4F9B]" />
              <p className="mt-2 text-sm font-semibold text-[#173B7A]">
                {title}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#526078]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
