import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo-mark";

export function PublicInfoShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#FFF8EF] px-4 py-10 text-[#173B7A] sm:py-16">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold"
        >
          <LogoMark
            size={24}
            idSuffix={`-${eyebrow.toLowerCase().replaceAll(" ", "-")}`}
          />{" "}
          AgentStack
        </Link>
        <div className="mt-12 max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.25em] text-[#DB4F9B] uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">
            {title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-[#526078]">{intro}</p>
        </div>
        <div className="mt-12">{children}</div>
        <footer className="mt-16 flex flex-wrap gap-5 border-t border-[#E7DCC7] pt-6 text-sm text-[#526078]">
          <Link href="/help">Help</Link>
          <Link href="/security">Security</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href="/status">Status</Link>
          <Link href="/beta">Beta</Link>
        </footer>
      </div>
    </main>
  );
}
