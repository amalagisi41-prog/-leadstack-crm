"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Public unsubscribe confirmation page. The page POSTs to /api/u/[token]
 * automatically on mount to flip emailOptedOut on the contact, then shows
 * a confirmation. We do this client-side so email-link previewers (which
 * issue HEAD/GET) don't accidentally opt people out.
 *
 * No layout chrome (sidebar/header) — this page renders standalone.
 */
type Status = "loading" | "ok" | "error";

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/u/${token}`, { method: "POST" });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Could not process unsubscribe.");
        }
        setStatus("ok");
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Could not process unsubscribe.",
        );
        setStatus("error");
      }
    })();
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        {status === "loading" && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-full bg-muted" />
            <h1 className="text-lg font-semibold">Working on it…</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hold on while we update your preferences.
            </p>
          </>
        )}
        {status === "ok" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We won&apos;t send you any more marketing emails from this
              workspace. If this was a mistake, reply to a previous email and
              we&apos;ll add you back manually.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {errorMessage}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Reply to a previous email and we&apos;ll opt you out manually.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
