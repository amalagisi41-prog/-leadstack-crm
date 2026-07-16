"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { signInWithEmail } from "@/lib/firebase/auth";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";

const perks = [
  "No credit card required to start",
  "Full AI follow-up from day one",
  "Import existing contacts in minutes",
  "Cancel anytime, no questions asked",
];

export function SignupCta() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: name,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };

      if (!res.ok) {
        if (res.status === 409) {
          setError("You already have an account. Sign in instead.");
          return;
        }
        throw new Error(payload.error ?? "Could not create account.");
      }

      await signInWithEmail(email, password);
      router.push(payload.redirectTo ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="signup"
      className="relative overflow-hidden bg-[#FFF8EF] py-24 md:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(219,79,155,0.08)_0%,transparent_65%)]" />

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Left: copy */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
                Get started free
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
                Build your business once.{" "}
                <span className="font-sans font-normal italic text-[#DB4F9B]">
                  Let AgentStack handle the rest.
                </span>
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#526078] sm:text-lg">
                Set up in 15 minutes. AgentStack handles lead capture, instant
                response, follow-up, and scheduling — so you can focus on
                closing.
              </p>
              <ul className="mt-6 space-y-3">
                {perks.map((perk) => (
                  <li
                    key={perk}
                    className="flex items-center gap-2.5 text-sm text-[#173B7A]/85"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4F91FF]" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: signup form */}
            <div className="rounded-[1.75rem] border border-[#E7DCC7] bg-white p-6 shadow-[0_20px_60px_rgba(23,59,122,0.08)]">
              <h3 className="text-lg font-semibold text-[#173B7A]">
                Create your free account
              </h3>
              <p className="mt-0.5 text-xs text-[#7B8AA1]">
                No credit card · cancel anytime
              </p>

              <div className="mt-5">
                <SocialAuthButtons
                  mode="signup"
                  tone="dark"
                  onError={setError}
                />
              </div>

              <form onSubmit={handleSubmit} className="mt-3 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#526078]">
                    Full name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Jane Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-[#E7DCC7] bg-white px-3 py-2.5 text-sm text-[#173B7A] placeholder:text-[#7B8AA1]/60 focus:border-[#4F91FF]/60 focus:outline-none focus:ring-1 focus:ring-[#4F91FF]/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#526078]">
                    Work email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-[#E7DCC7] bg-white px-3 py-2.5 text-sm text-[#173B7A] placeholder:text-[#7B8AA1]/60 focus:border-[#4F91FF]/60 focus:outline-none focus:ring-1 focus:ring-[#4F91FF]/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#526078]">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[#E7DCC7] bg-white px-3 py-2.5 text-sm text-[#173B7A] placeholder:text-[#7B8AA1]/60 focus:border-[#4F91FF]/60 focus:outline-none focus:ring-1 focus:ring-[#4F91FF]/30"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-500">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#173B7A] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#214b95] disabled:opacity-60"
                >
                  {loading ? (
                    "Creating account…"
                  ) : (
                    <>
                      Start free — no card needed
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <p className="text-center text-[10px] text-blue-400/40">
                  By signing up you agree to our{" "}
                  <Link
                    href="/terms"
                    className="underline decoration-[#173B7A]/30 underline-offset-4 hover:decoration-[#173B7A]/60"
                  >
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="underline decoration-[#173B7A]/30 underline-offset-4 hover:decoration-[#173B7A]/60"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </form>

              <div className="mt-4 border-t border-[#EFE4D3] pt-4 text-center">
                <p className="text-xs text-[#7B8AA1]">
                  Already have an account?{" "}
                  <Link
                    href="/login"
                    className="text-[#173B7A] transition-colors hover:text-[#DB4F9B]"
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
