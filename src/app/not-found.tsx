import Link from "next/link";

/** A recoverable fallback for stale bookmarks and assistant-generated URLs. */
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          AgentStack
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          That page moved
        </h1>
        <p className="mt-3 text-muted-foreground">
          This link is no longer active. Return to your workspace and Zack can
          help you find the right place or finish the setup.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Back to workspace
          </Link>
          <Link
            href="/agency"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Agency home
          </Link>
        </div>
      </div>
    </main>
  );
}
