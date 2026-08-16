"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, LifeBuoy } from "lucide-react";

/**
 * What an agent sees when something breaks.
 *
 * Before this existed there was no error boundary anywhere in the app, so any
 * uncaught error rendered React's bare production page — "Application error: a
 * client-side exception has occurred" on a white screen, with no explanation,
 * no way back, and nothing to quote to support. That is both a dead end and a
 * guaranteed support ticket: the agent's only remaining move is to email
 * someone, and the first thing they will be asked for is the detail this page
 * now shows them.
 *
 * A real example from production: a site document written before the SEO
 * fields existed made the editor read `content.metaTitle.length`, which threw
 * and took the whole client down. The underlying bug is fixed, but the class
 * of failure is not preventable in general — so it needs a landing place.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest is the only handle that ties this screen to a server log line.
    console.error("[app-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">
              Something on this page stopped working
            </h1>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              Your data is safe — nothing was changed or lost. This is a
              display problem on this screen only, and the rest of your
              workspace is unaffected.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-[#173b7a] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1d4a94]"
          >
            <RefreshCw className="h-4 w-4" />
            Try this page again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-slate-50"
          >
            Go to my dashboard
          </Link>
        </div>

        <p className="text-muted-foreground mt-5 flex items-start gap-2 rounded-xl border bg-slate-50 p-3 text-xs leading-5">
          <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            If it keeps happening, quote this reference:{" "}
            <code className="font-mono font-semibold">
              {error.digest ?? "no-reference"}
            </code>
          </span>
        </p>
      </div>
    </div>
  );
}
