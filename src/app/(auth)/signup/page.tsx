import { Suspense } from "react";
import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { LogoMark } from "@/components/brand/logo-mark";
import { CUSTOM_BRAND } from "@/config/landing";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={24} idSuffix="-signup" />
            <h1 className="text-2xl font-bold">{CUSTOM_BRAND.name}</h1>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Start closing with the CRM your team will actually use.
          </p>
        </div>

        {/* Suspense required because SignupForm reads ?email= via
            useSearchParams to pre-fill from invite links. */}
        <Suspense fallback={<div className="h-[480px] rounded-xl border bg-card" />}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
