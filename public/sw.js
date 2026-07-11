// Minimal service worker -- exists to satisfy PWA installability criteria
// (Chrome/Android requires a registered SW with a fetch handler before it
// will fire the native "Install app" prompt) and to keep the dashboard shell
// reachable when a realtor opens the installed app with a spotty signal.
//
// Deliberately conservative: only intercepts same-origin GET navigations and
// this app's own static assets. Everything else (Firestore, API routes, auth)
// passes straight through untouched -- this is not meant to be an offline
// data cache, just an offline "you're offline" shell instead of a dead tab.
const CACHE_NAME = "agentstack-shell-v1";
const SHELL_URLS = ["/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Only handle page navigations and this app's own /icons — leave every
  // other request (API routes, Firestore/Firebase, Next.js data fetches)
  // completely alone so nothing here can shadow live data with a stale copy.
  const isNavigation = request.mode === "navigate";
  const isShellAsset = SHELL_URLS.includes(url.pathname);
  if (!isNavigation && !isShellAsset) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (isShellAsset && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
