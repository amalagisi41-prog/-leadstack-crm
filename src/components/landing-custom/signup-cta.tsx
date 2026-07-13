"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { signInWithEmail } from "@/lib/firebase/auth";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";

const perks = [
  "No credit card required to start",
  "Every lead followed up automatically, from day one",
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
      className="relative overflow-hidden bg-[#1a2540] py-24"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.42_0.18_263)_/_18%,transparent_65%)]" />

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Left: copy */}
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-blue-400">
                Get started free
              </p>
              <h2 className="text-3xl font-semibold tracking-tighter text-white sm:text-4xl">
                Build your business once.{" "}
                <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text font-sans font-normal italic text-transparent">
                  Let AgentStack handle the rest.
                </span>
              </h2>
              <p className="mt-3 text-sm font-semibold text-blue-300/90">
                Get your business fully operational in about 15 minutes.
              </p>
              <p className="mt-3 text-blue-200/70">
                AgentStack handles lead capture, instant response, follow-up,
                and scheduling — so you can focus on closing.
              </p>
              <ul className="mt-6 space-y-3">
                {perks.map((perk) => (
                  <li
                    key={perk}
                    className="flex items-center gap-2.5 text-sm text-blue-200/80"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: signup form */}
            <div className="rounded-2xl border border-[#2a3f5f]/60 bg-[#12203a] p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-white">
                Create your free account
              </h3>
              <p className="mt-0.5 text-xs text-blue-300/60">
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
                  <label className="mb-1.5 block text-xs font-medium text-blue-300/80">
                    Full name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Jane Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-blue-800/50 bg-blue-950/50 px-3 py-2.5 text-sm text-white placeholder:text-blue-300/30 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-blue-300/80">
                    Work email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-blue-800/50 bg-blue-950/50 px-3 py-2.5 text-sm text-white placeholder:text-blue-300/30 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-blue-300/80">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-blue-800/50 bg-blue-950/50 px-3 py-2.5 text-sm text-white placeholder:text-blue-300/30 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1a2f50] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#243d66] disabled:opacity-60"
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
                    className="underline hover:text-blue-400/70"
                  >
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="underline hover:text-blue-400/70"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </form>

              <div className="mt-4 border-t border-[#2a3f5f]/60 pt-4 text-center">
                <p className="text-xs text-blue-300/50">
                  Already have an account?{" "}
                  <Link
                    href="/login"
                    className="text-blue-400 transition-colors hover:text-blue-300"
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
