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
        <div className="space-y-2 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={24} idSuffix="-signup" />
            <h1 className="font-sans text-2xl font-bold">
              {CUSTOM_BRAND.name}
            </h1>
          </Link>
          <p className="text-muted-foreground mx-auto max-w-md font-sans text-sm">
            Join the Solo Founding Beta and follow one guided six-step setup:
            Build, Connect, Capture, Respond, Nurture, and Close.
          </p>
        </div>

        {/* Suspense required because SignupForm reads ?email= via
            useSearchParams to pre-fill from invite links. */}
        <Suspense
          fallback={<div className="bg-card h-[480px] rounded-xl border" />}
        >
          <SignupForm planKey={planKey} />
        </Suspense>
      </div>
    </div>
  );
}
