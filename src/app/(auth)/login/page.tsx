import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { LogoMark } from "@/components/brand/logo-mark";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={24} idSuffix="-login" />
            <h1 className="text-2xl font-bold">LeadStack</h1>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
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
