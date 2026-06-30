"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import type { ResolvedBrand } from "@/config/landing";
import { Logo } from "./logo";

const links = [
  { href: "#features", label: "For Agents" },
  { href: "#team", label: "For Brokers" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar({ brand }: { brand: ResolvedBrand }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={`${brand.name} logo`}
              className="h-6 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <Logo size={24} idSuffix="-nav" />
          )}
          <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
            {brand.name}
          </span>
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
          <ThemeToggle />
          {!loading && (
            <>
              {user ? (
                <Button render={<Link href="/dashboard" />} size="sm">
                  Dashboard
                </Button>
              ) : (
                <>
                  <Button render={<Link href="/login" />} variant="ghost" size="sm">
                    Login
                  </Button>
                  <Button
                    render={<a href={`mailto:${brand.supportEmail}`} />}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Start Free →
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
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
                      <Button
                        render={<Link href="/dashboard" />}
                        className="w-full"
                        size="sm"
                      >
                        Dashboard
                      </Button>
                    </SheetClose>
                  ) : (
                    <>
                      <SheetClose render={<span />}>
                        <Button
                          render={<Link href="/login" />}
                          variant="ghost"
                          className="w-full"
                          size="sm"
                        >
                          Login
                        </Button>
                      </SheetClose>
                      <SheetClose render={<span />}>
                        <Button
                          render={<a href={`mailto:${brand.supportEmail}`} />}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                          size="sm"
                        >
                          Start Free →
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
