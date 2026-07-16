import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const points = [
  "Branded search + detail pages — your logo, your domain",
  "Auto-synced from your IDX Broker account every 6 hours",
  "Every listing view captures a lead straight into your CRM",
  '"Request a showing" form on every listing, no extra setup',
];

export function IdxShowcase() {
  return (
    <section id="idx" className="bg-white py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
            IDX listings
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
            IDX Real Estate Websites{" "}
            <span className="font-sans font-normal italic text-[#DB4F9B]">
              built to feel familiar.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#526078] sm:text-lg">
            Connect your IDX Broker account once. Every listing search, on any device, feeds leads straight into your CRM.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <div className="rounded-[2.25rem] border border-[#E7DCC7] bg-[#FFF8EF] p-3 shadow-[0_30px_90px_rgba(23,59,122,0.10)] sm:p-4">
            <div className="overflow-hidden rounded-[1.75rem] border border-[#E9DECA] bg-white">
              <div className="flex items-center justify-between border-b border-[#EFE4D3] bg-[#FCF7EF] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3 text-xs font-medium text-[#526078] sm:text-sm">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                  <span className="flex h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                  <span className="flex h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                  <span className="ml-2 rounded-full bg-white px-3 py-1 text-[#173B7A] shadow-[0_4px_12px_rgba(23,59,122,0.06)]">
                    IDX preview
                  </span>
                </div>
                <span className="hidden text-xs font-medium text-[#7B8AA1] sm:block">
                  Live listings search on desktop and mobile
                </span>
              </div>

              <div className="bg-[#FFF6E8] p-4 sm:p-6 lg:p-8">
                <div className="mx-auto max-w-[460px] overflow-hidden rounded-[1.5rem] bg-white shadow-[0_24px_70px_rgba(23,59,122,0.12)] ring-1 ring-[#E9DECA]">
                  <Image
                    src="/idx-reference-mobile.png"
                    alt="IDX real estate websites shown on mobile"
                    width={1284}
                    height={2778}
                    priority
                    sizes="(min-width: 1024px) 460px, 100vw"
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_auto] lg:items-center">
            <div className="text-center lg:text-left">
              <p className="text-lg font-medium text-[#173B7A] sm:text-xl">
                Your own listings site, live on your laptop and their phone.
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#526078] sm:text-base">
                Every listing search, on any device, feeds leads straight into your CRM.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <Button
                render={<Link href="#signup" />}
                className="bg-[#173B7A] text-white hover:bg-[#214b95]"
              >
                See IDX pricing
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {points.map((point) => (
              <div
                key={point}
                className="flex items-start gap-3 rounded-2xl border border-[#E7DCC7] bg-[#FFF6E8] px-4 py-3"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4F91FF]/15 text-[#4F91FF]">
                  ✓
                </span>
                <p className="text-sm leading-6 text-[#173B7A]">{point}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-4xl rounded-full border border-[#D8CFBD] bg-[#FFF6E8] px-6 py-3 text-center font-sans text-base font-semibold text-[#173B7A] shadow-[0_10px_30px_rgba(23,59,122,0.05)]">
          The operating system for modern real estate professionals
        </div>
      </div>
    </section>
  );
}
