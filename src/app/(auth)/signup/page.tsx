import { Suspense } from "react";
import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { LogoMark } from "@/components/brand/logo-mark";
import {
  CUSTOM_BRAND,
  isMarketingPlanKey,
  type MarketingPlanKey,
} from "@/config/landing";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const planKey: MarketingPlanKey | null = isMarketingPlanKey(params.plan)
    ? params.plan
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={24} idSuffix="-signup" />
            <h1 className="font-sans text-2xl font-bold">{CUSTOM_BRAND.name}</h1>
          </Link>
          <p className="mx-auto max-w-md font-sans text-sm text-muted-foreground">
            Open beta registration — create a workspace and explore every tool.
          </p>
        </div>

        {/* Suspense required because SignupForm reads ?email= via
            useSearchParams to pre-fill from invite links. */}
        <Suspense fallback={<div className="h-[480px] rounded-xl border bg-card" />}>
          <SignupForm planKey={planKey} />
        </Suspense>
      </div>
    </div>
  );
}
