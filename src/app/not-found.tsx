"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { subAccountHomeFromPath } from "@/lib/navigation/sub-account-routes";

/**
 * A recoverable fallback for stale bookmarks, mistyped URLs, and dead links
 * inside the app.
 *
 * This page used to announce "That page moved — this link is no longer
 * active," which it cannot know. A 404 has many causes (a typo, a stale
 * bookmark, a deployment mid-rollout, a genuinely broken link in our own
 * nav) and naming the wrong one sends the user off to look for a page that
 * was never moved.
 *
 * It also never showed WHICH address failed. That cost a real diagnosis: a
 * browser QA pass reported two nav destinations 404ing and could say only
 * which labels were clicked, because the screen it landed on named nothing —
 * the routes themselves exist and build, so there was nothing to go on.
 * Showing the address turns the next such report into a bug that can be
 * traced, and is the "say what is missing by name" rule applied here.
 */
export default function NotFound() {
  const pathname = usePathname();
  // Back to the workspace they were already in, not the legacy flat route.
  const workspaceHome = subAccountHomeFromPath(pathname);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="bg-card w-full max-w-lg rounded-2xl border p-8 text-center shadow-sm">
        <p className="text-muted-foreground text-sm font-semibold tracking-[0.2em] uppercase">
          AgentStack
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          We couldn&apos;t find that page
        </h1>
        <p className="text-muted-foreground mt-3">
          Nothing is set up at this address. It may be a mistyped or old link.
        </p>

        {pathname ? (
          <div className="mt-4 text-left">
            <p className="text-muted-foreground text-xs font-medium">
              The address we tried
            </p>
            <code className="bg-muted mt-1 block overflow-x-auto rounded-md px-3 py-2 text-xs break-all">
              {pathname}
            </code>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={workspaceHome ?? "/dashboard"}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Back to my workspace
          </Link>
          <Link
            href="/agency"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Agency home
          </Link>
        </div>

        <p className="text-muted-foreground mt-6 text-xs">
          If you got here by clicking something inside AgentStack, that&apos;s a
          broken link on our side — send us the address above and we&apos;ll fix
          it.
        </p>
      </div>
    </main>
  );
}
