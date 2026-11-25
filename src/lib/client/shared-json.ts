/**
 * Request de-duplication for client reads several components make at once.
 *
 * The sidebar badge, the setup bar and the dashboard card each read setup
 * progress for the same workspace on every page load; without this each
 * fired its own copy of the same two API requests (3× per page, measured).
 * Concurrent callers within `ttlMs` share one in-flight request and its
 * parsed JSON. Errors are never cached, and `ttlMs` is short so a value
 * changed on another page is picked up by the next read.
 */
const cache = new Map<string, { at: number; promise: Promise<unknown | null> }>();

export function fetchJsonShared<T>(url: string, ttlMs = 5000): Promise<T | null> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.at < ttlMs) return hit.promise as Promise<T | null>;
  const promise = fetch(url)
    .then(async (r) => (r.ok ? ((await r.json()) as T) : null))
    .catch(() => null)
    .then((value) => {
      if (value === null) cache.delete(url); // never cache a failure
      return value;
    });
  cache.set(url, { at: now, promise });
  return promise;
}

/** Test helper. */
export function clearSharedJsonCache(): void {
  cache.clear();
}
