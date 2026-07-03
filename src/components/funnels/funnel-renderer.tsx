"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { FunnelContent } from "@/types/funnel";

/**
 * Shared funnel renderer — draws a funnel as a focused, single-column
 * landing page with one lead-capture form. Used in TWO places:
 *
 *  - The builder's live preview (`preview` set → the form never submits,
 *    it just flips to the thank-you state so the agent can see it).
 *  - The public page at /l/[subAccountId]/[slug] (`submit` set → the form
 *    POSTs to the submit route, which creates a contact).
 *
 * Fully self-contained styling (Tailwind classes only) so it renders the
 * same inside the dashboard preview and on the standalone public route.
 */

interface FunnelRendererProps {
  content: FunnelContent;
  businessName?: string;
  /** Live target. When set, the form actually submits + creates a contact. */
  submit?: { subAccountId: string; slug: string };
  /** Preview mode — form is inert (submitting just shows the thank-you). */
  preview?: boolean;
}

export function FunnelRenderer({
  content,
  businessName,
  submit,
  preview,
}: FunnelRendererProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  const dark = content.theme === "navy";
  const pageBg = dark ? "bg-[#0f1b33]" : "bg-slate-50";
  const cardBg = dark ? "bg-[#16264a]" : "bg-white";
  const headingColor = dark ? "text-white" : "text-slate-900";
  const bodyColor = dark ? "text-blue-100/80" : "text-slate-600";
  const accent = dark ? "text-blue-300" : "text-blue-600";
  const btnColor = dark
    ? "bg-blue-500 hover:bg-blue-400 text-white"
    : "bg-[#1b3d7a] hover:bg-[#16305f] text-white";
  const inputColor = dark
    ? "bg-[#0f1b33] border-blue-900/60 text-white placeholder:text-blue-200/40"
    : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || !submit) {
      // Builder preview — no network call, just show the thank-you panel.
      setStatus("done");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch(
        `/api/l/${submit.subAccountId}/${submit.slug}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className={`min-h-full w-full ${pageBg} px-4 py-12 sm:py-16`}>
      <div className="mx-auto max-w-xl">
        {businessName ? (
          <p
            className={`mb-6 text-center text-sm font-semibold uppercase tracking-wide ${accent}`}
          >
            {businessName}
          </p>
        ) : null}

        {content.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={content.imageUrl}
            alt=""
            className="mb-8 max-h-64 w-full rounded-2xl object-cover"
          />
        ) : null}

        <h1
          className={`text-balance text-center text-3xl font-bold leading-tight tracking-tight sm:text-4xl ${headingColor}`}
        >
          {content.headline || "Your headline goes here"}
        </h1>
        {content.subhead ? (
          <p className={`mt-4 text-center text-base sm:text-lg ${bodyColor}`}>
            {content.subhead}
          </p>
        ) : null}

        {content.benefits.filter(Boolean).length > 0 ? (
          <ul className="mx-auto mt-8 max-w-md space-y-3">
            {content.benefits.filter(Boolean).map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    dark ? "bg-blue-500/20" : "bg-blue-100"
                  }`}
                >
                  <Check className={`h-3 w-3 ${accent}`} />
                </span>
                <span className={`text-sm ${bodyColor}`}>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={`mt-10 rounded-2xl border p-6 shadow-sm ${cardBg} ${dark ? "border-blue-900/50" : "border-slate-200"}`}>
          {status === "done" ? (
            <div className="py-6 text-center">
              <div
                className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
                  dark ? "bg-blue-500/20" : "bg-green-100"
                }`}
              >
                <Check className={`h-6 w-6 ${dark ? "text-blue-300" : "text-green-600"}`} />
              </div>
              <p className={`text-base font-medium ${headingColor}`}>
                {content.thankYouMessage || "Thanks! We'll be in touch shortly."}
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={`w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 ${inputColor}`}
              />
              {content.collectEmail ? (
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className={`w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 ${inputColor}`}
                />
              ) : null}
              {content.collectPhone ? (
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  className={`w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 ${inputColor}`}
                />
              ) : null}
              {status === "error" ? (
                <p className="text-sm text-red-500">{errorMsg}</p>
              ) : null}
              <button
                type="submit"
                disabled={status === "sending"}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-70 ${btnColor}`}
              >
                {status === "sending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {content.ctaLabel || "Submit"}
              </button>
              <p
                className={`text-center text-[11px] ${dark ? "text-blue-200/40" : "text-slate-400"}`}
              >
                We respect your privacy. Your information is never sold.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
