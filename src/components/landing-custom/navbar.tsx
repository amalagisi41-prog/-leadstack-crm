"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ResolvedBrand } from "@/config/landing";
import { BrandLockup } from "./brand-lockup";

const links = [
  { href: "#how-it-works", label: "The Method" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar({ brand }: { brand: ResolvedBrand }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#173B7A]/10 bg-[#FFF6E8]/95 text-[#173B7A] backdrop-blur">
      <div className="container mx-auto flex h-16 items-center gap-4 px-4">
        <Link
          href="/"
          className="shrink-0"
        >
          {brand.logoUrl && brand.name.toLowerCase() !== "agentstack" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={`${brand.name} logo`}
              className="h-8 w-auto max-w-[160px] object-contain"
            />
          ) : (
            <BrandLockup brand={brand} showMark size="sm" subline="" />
          )}
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-6 md:flex">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-[#526078] transition-colors hover:text-[#173B7A]"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 md:flex">
          {!loading && (
            <>
              {user ? (
                <Button render={<Link href="/dashboard" />} size="sm">
                  Open Workspace
                </Button>
              ) : (
                <>
                  <Button
                    render={<Link href="/login" />}
                    variant="ghost"
                    size="sm"
                  >
                    Sign in
                  </Button>
                  <Button
                    render={<Link href="/signup" />}
                    size="sm"
                    className="bg-[#1a2f50] text-white hover:bg-[#243d66]"
                  >
                    Start Free
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-4 p-4">
              {links.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
                >
                  {label}
                </a>
              ))}
              {!loading && (
                <>
                  {user ? (
                    <Button
                      render={<Link href="/dashboard" />}
                      className="w-full"
                      size="sm"
                      onClick={() => setOpen(false)}
                    >
                      Open Workspace
                    </Button>
                  ) : (
                    <>
                      <Button
                        render={<Link href="/login" />}
                        variant="ghost"
                        className="w-full"
                        size="sm"
                        onClick={() => setOpen(false)}
                      >
                        Sign in
                      </Button>
                      <Button
                        render={<Link href="/signup" />}
                        className="w-full bg-[#1a2f50] text-white hover:bg-[#243d66]"
                        size="sm"
                        onClick={() => setOpen(false)}
                      >
                        Start Free
                      </Button>
                    </>
                  )}
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
