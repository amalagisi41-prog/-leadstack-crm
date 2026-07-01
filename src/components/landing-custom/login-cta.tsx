import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ResolvedBrand } from "@/config/landing";

export function LoginCta({ brand }: { brand: ResolvedBrand }) {
  return (
    <section className="relative overflow-hidden py-24 bg-[#1a2540]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.42_0.18_263)_/_20%,transparent_65%)]" />

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-[#2a3f5f]/60 bg-[#12203a] shadow-2xl overflow-hidden">
            <div className="border-b border-[#2a3f5f]/60 px-6 py-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400 mb-1">Welcome back</p>
              <h2 className="text-xl font-semibold text-white">
                Sign in to your LeadStack workspace
              </h2>
              <p className="mt-1 text-xs text-blue-300/60">
                {brand.name} · powered by LeadStack CRM
              </p>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 border-b border-[#2a3f5f]/60">
              <div className="border-b-2 border-blue-500 bg-blue-500/10 px-4 py-3 text-center text-sm font-semibold text-blue-400">
                Sign In
              </div>
              <div className="px-4 py-3 text-center text-sm font-medium text-blue-300/50 hover:text-blue-300 transition-colors cursor-default">
                Create Account
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-blue-300/80 mb-1.5">Email address</label>
                <div className="rounded-lg border border-blue-800/50 bg-blue-950/50 px-3 py-2.5 text-sm text-blue-300/40">
                  you@example.com
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-blue-300/80">Password</label>
                  <span className="text-[10px] text-blue-400 hover:text-blue-300 cursor-default">Forgot password?</span>
                </div>
                <div className="rounded-lg border border-blue-800/50 bg-blue-950/50 px-3 py-2.5 text-sm text-blue-300/40">
                  ••••••••
                </div>
              </div>

              <Button
                render={<Link href="/login" />}
                className="w-full bg-[#1a2f50] hover:bg-[#243d66] text-white"
                size="lg"
              >
                Sign In →
              </Button>

              <div className="text-center">
                <Link
                  href="/signup"
                  className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors"
                >
                  No account yet? Start for free — no card needed
                </Link>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-blue-400/40">
            Your data is encrypted and never sold. Cancel anytime.
          </p>
        </div>
      </div>
    </section>
  );
}
