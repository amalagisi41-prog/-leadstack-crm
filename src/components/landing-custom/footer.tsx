import Link from "next/link";
import type { ResolvedBrand } from "@/config/landing";
import { BrandLockup } from "./brand-lockup";

export function Footer({ brand }: { brand: ResolvedBrand }) {
  return (
    <footer className="border-t border-[#E7DCC7] bg-[#FFF8EF] py-12 text-[#173B7A]">
      <div className="container mx-auto px-4">
        <div className="grid gap-8 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              {brand.logoUrl && brand.name.toLowerCase() !== "agentstack" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logoUrl}
                  alt={`${brand.name} logo`}
                  className="h-8 w-auto max-w-[140px] object-contain"
                />
              ) : (
                <BrandLockup brand={brand} size="sm" showMark />
              )}
            </Link>
            <p className="mt-3 text-sm leading-6 text-[#526078]">
              {brand.tagline}.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Product</h3>
            <ul className="space-y-2 text-sm text-[#526078]">
              <li>
                <a
                  href="#features"
                  className="transition-colors hover:text-[#173B7A]"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#faq"
                  className="transition-colors hover:text-[#173B7A]"
                >
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Legal</h3>
            <ul className="space-y-2 text-sm text-[#526078]">
              <li>
                <Link
                  href="/terms"
                  className="transition-colors hover:text-[#173B7A]"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="transition-colors hover:text-[#173B7A]"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Contact</h3>
            <ul className="space-y-2 text-sm text-[#526078]">
              <li>
                <a
                  href={`mailto:${brand.supportEmail}`}
                  className="transition-colors hover:text-[#173B7A]"
                >
                  {brand.supportEmail}
                </a>
              </li>
              <li>
                <a
                  href={`https://${brand.primaryDomain}`}
                  className="transition-colors hover:text-[#173B7A]"
                >
                  {brand.primaryDomain}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-[#EFE4D3] pt-8 text-center text-sm text-[#7B8AA1]">
          &copy; {new Date().getFullYear()} {brand.name} &middot; The easiest way to run a modern real estate business.
        </div>
      </div>
    </footer>
  );
}
