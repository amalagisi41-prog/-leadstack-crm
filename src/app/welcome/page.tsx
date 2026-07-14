import { Suspense } from "react";
import Link from "next/link";
import { WelcomeClaimForm } from "@/components/auth/welcome-claim-form";
import { LogoMark } from "@/components/brand/logo-mark";
import { CUSTOM_BRAND } from "@/config/landing";

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={24} idSuffix="-welcome" />
            <h1 className="font-sans text-2xl font-bold">{CUSTOM_BRAND.name}</h1>
          </Link>
          <p className="mx-auto max-w-md font-sans text-sm text-muted-foreground">
            Thanks for subscribing — one more step and your workspace is ready.
          </p>
        </div>

        {/* Suspense required — WelcomeClaimForm reads ?session_id=&t= via
            useSearchParams. */}
        <Suspense fallback={<div className="h-[420px] rounded-xl border bg-card" />}>
          <WelcomeClaimForm />
        </Suspense>
      </div>
    </div>
  );
}
