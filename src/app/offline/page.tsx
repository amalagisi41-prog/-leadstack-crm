import type { Metadata } from "next";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";

const brandName =
  LANDING_VARIANT === "custom" ? CUSTOM_BRAND.name : "AgentStack";

export const metadata: Metadata = {
  title: `${brandName} — no connection`,
  robots: { index: false, follow: false },
};

/**
 * What the installed app shows when a page cannot be reached.
 *
 * Precached by the service worker so it is available with no network at all.
 * It exists because an installed app that dies into the browser's own error
 * page reads as broken software rather than a bad signal — and the people
 * using this are opening it in cars, basements and lifts.
 *
 * Static and self-contained on purpose: no data fetching, no client bundle to
 * download, nothing that can itself fail while offline. The retry is a plain
 * reload, which succeeds the moment the connection returns.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FBFCFE] px-6 font-sans">
      <div className="w-full max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          className="mx-auto h-16 w-16 object-contain"
        />
        <h1 className="mt-5 text-xl font-bold text-[#173B7A]">
          You&rsquo;re offline
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#526078]">
          {brandName} could not reach the internet. Nothing has been lost —
          your data is safe on the server, and this page will load as soon as
          you have a signal again.
        </p>

        {/*
          A plain link rather than a scripted reload: this page has to work
          with no JavaScript executed at all, which is exactly the condition
          it is built for.
        */}
        <a
          href="/dashboard"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-[#173B7A] px-5 text-sm font-semibold text-white"
        >
          Try again
        </a>

        <p className="mt-6 text-xs leading-5 text-[#7B8AA1]">
          If this keeps happening on a good connection, check whether your
          device is in Airplane Mode or connected to a Wi-Fi network that needs
          a sign-in.
        </p>
      </div>
    </div>
  );
}
