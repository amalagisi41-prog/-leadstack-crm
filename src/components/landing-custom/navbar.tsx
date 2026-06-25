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

export function Navbar({ brand }: { brand: ResolvedBrand }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  const navItems = (
    <>
      <a
        href="#features"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Features
      </a>
      <a
        href="#faq"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        FAQ
      </a>
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
              <Button render={<Link href="/signup" />} size="sm">
                Sign Up
              </Button>
            </>
          )}
        </>
      )}
    </>
  );

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

        <nav className="hidden items-center gap-4 md:flex">
          <ThemeToggle />
          {navItems}
        </nav>

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
              <SheetClose
                render={<a href="#features" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Features
              </SheetClose>
              <SheetClose
                render={<a href="#faq" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                FAQ
              </SheetClose>
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
                          render={<Link href="/signup" />}
                          className="w-full"
                          size="sm"
                        >
                          Sign Up
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
