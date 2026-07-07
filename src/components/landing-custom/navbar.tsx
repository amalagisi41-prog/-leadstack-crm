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
  SheetClose,
} from "@/components/ui/sheet";
import type { ResolvedBrand } from "@/config/landing";
import { BrandLockup } from "./brand-lockup";

const links = [
  { href: "#how-it-works", label: "The Method" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar({ brand }: { brand: ResolvedBrand }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#173B7A]/10 bg-[#FFF6E8]/95 text-[#173B7A] backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          {brand.logoUrl && brand.name.toLowerCase() !== "agentstack" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={`${brand.name} logo`}
              className="h-8 w-auto max-w-[160px] object-contain"
            />
          ) : (
            <BrandLockup brand={brand} showMark />
          )}
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {!loading && (
            <>
              {user ? (
                <Button render={<Link href="/dashboard" />} size="sm">
                  Dashboard
                </Button>
              ) : (
                <>
                  <Button render={<Link href="/login" />} variant="ghost" size="sm">
                    Sign in
                  </Button>
                  <Button
                    render={<Link href="/signup" />}
                    size="sm"
                    className="bg-[#1a2f50] hover:bg-[#243d66] text-white"
                  >
                    Start Free
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
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
                <SheetClose
                  key={href}
                  render={<a href={href} />}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {label}
                </SheetClose>
              ))}
              {!loading && (
                <>
                  {user ? (
                    <SheetClose render={<span />}>
                      <Button render={<Link href="/dashboard" />} className="w-full" size="sm">
                        Dashboard
                      </Button>
                    </SheetClose>
                  ) : (
                    <>
                      <SheetClose render={<span />}>
                        <Button render={<Link href="/login" />} variant="ghost" className="w-full" size="sm">
                          Sign in
                        </Button>
                      </SheetClose>
                      <SheetClose render={<span />}>
                        <Button
                          render={<Link href="/signup" />}
                          className="w-full bg-[#1a2f50] hover:bg-[#243d66] text-white"
                          size="sm"
                        >
                          Start Free
                        </Button>
                      </SheetClose>
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
