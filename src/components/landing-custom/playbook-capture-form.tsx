"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { AGENTSTACK_METHOD_NAME } from "@/config/landing";

const playbookHighlights = [
  "The six-step AgentStack Method setup flow",
  "What to connect first so no lead slips through",
  "The follow-up sequence that matters most in real estate",
];

export function PlaybookCaptureForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/marketing/playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          pageUrl:
            typeof window !== "undefined" ? window.location.href : undefined,
          referrer:
            typeof document !== "undefined" ? document.referrer : undefined,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(
          payload.error ?? "We couldn't save your request right now.",
        );
      }

      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't save your request right now.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative overflow-hidden bg-[#FFF8EF] py-24 md:py-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(79,145,255,0.08)_0%,transparent_65%)]" />

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
                Not ready yet?
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
                Get{" "}
                <span className="font-sans font-normal italic text-[#DB4F9B]">
                  {AGENTSTACK_METHOD_NAME}
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#526078] sm:text-lg">
                We&apos;ll save your place in the nurture flow and follow up
                with the setup guidance that matters most before you start.
              </p>
              <ul className="mt-6 space-y-3">
                {playbookHighlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2.5 text-sm text-[#173B7A]/85"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4F91FF]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[1.75rem] border border-[#E7DCC7] bg-white p-6 shadow-[0_20px_60px_rgba(23,59,122,0.08)]">
              <h2 className="text-lg font-semibold text-[#173B7A]">
                Get the playbook
              </h2>
              <p className="mt-0.5 text-xs text-[#7B8AA1]">
                Low-commitment. Helpful. No account required.
              </p>

              {submitted ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-[#D7E6FF] bg-[#F7FAFF] p-4">
                    <p className="text-sm font-medium text-[#173B7A]">
                      You&apos;re on the list.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#526078]">
                      We&apos;ve saved your request for{" "}
                      {AGENTSTACK_METHOD_NAME} and tagged it for follow-up in
                      the CRM.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link
                      href="/"
                      className="inline-flex items-center justify-center rounded-xl bg-[#173B7A] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#214b95]"
                    >
                      Back to home
                    </Link>
                    <Link
                      href="/signup"
                      className="inline-flex items-center justify-center rounded-xl border border-[#E7DCC7] px-4 py-3 text-sm font-semibold text-[#173B7A] transition-colors hover:border-[#4F91FF]/40 hover:text-[#214b95]"
                    >
                      Start free when you&apos;re ready
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-5 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#526078]">
                      Full name
                    </label>
                    <input
                      type="text"
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

                  {error && <p className="text-xs text-red-500">{error}</p>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#173B7A] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#214b95] disabled:opacity-60"
                  >
                    {loading ? (
                      "Saving your request…"
                    ) : (
                      <>
                        Get the playbook
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <p className="text-center text-[10px] text-blue-400/40">
                    We&apos;ll keep this in the CRM as a nurture request so the
                    next follow-up you get is actually useful.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
