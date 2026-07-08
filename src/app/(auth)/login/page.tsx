import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { LogoMark } from "@/components/brand/logo-mark";
import { CUSTOM_BRAND } from "@/config/landing";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={24} idSuffix="-login" />
            <h1 className="font-sans text-2xl font-bold">{CUSTOM_BRAND.name}</h1>
          </Link>
          <p className="mx-auto max-w-md font-sans text-sm text-muted-foreground">
            Welcome back. Sign in to your workspace.
          </p>
        </div>

        {/* Suspense required because LoginForm reads ?email= via
            useSearchParams to pre-fill from "you already have an account"
            redirects out of the signup page. */}
        <Suspense fallback={<div className="h-[420px] rounded-xl border bg-card" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
