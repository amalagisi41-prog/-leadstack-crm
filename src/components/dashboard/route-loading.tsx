/**
 * Instant navigation acknowledgement. Rendered by the route-level loading.tsx
 * files, so a nav click swaps to this placeholder in the same frame instead of
 * leaving the old page frozen while the next one renders on the server. Plain
 * placeholder blocks only — no content of its own.
 */
export function RouteLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="bg-muted h-7 w-48 animate-pulse rounded" />
        <div className="bg-muted h-4 w-72 animate-pulse rounded" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-muted h-24 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-muted h-64 animate-pulse rounded-xl" />
    </div>
  );
}
