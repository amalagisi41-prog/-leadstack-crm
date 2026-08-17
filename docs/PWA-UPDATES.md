# How installed apps get updates

AgentStack installs as a PWA, not a store app. There is no build bundled into
the install and no review queue, so **a normal deploy is the update**. Nothing
extra needs to be done to ship a change to installed apps.

This document exists for the one case where that is not automatically true,
and for the two files that can break it.

## What updates on its own

| Change | Reaches installed apps |
| --- | --- |
| Any server code, page, API route, data | Immediately — never cached |
| Any client code (JS/CSS chunks) | On the app's next load |
| App name, description | On the manifest's next fetch |
| Icons rendered *inside* the app | On the next successful online fetch |
| **The installed app's launcher icon** | **Not automatically — see below** |

The service worker caches exactly three things — the two PWA icons and
`/offline` — and every request is network-first. The cache is a fallback for
when the network fails, never a source of truth. That means a stale cached
asset self-heals the next time it is fetched successfully.

## The launcher icon is a snapshot, and mostly cannot be replaced

This is the one thing a deploy genuinely cannot push to an installed app, and
it surprises people every time.

When someone installs the app, the operating system copies the icon into the
Dock, home screen, or launcher. That copy belongs to the OS. Replacing the
bytes on the server changes what the *site* serves; it does not reach into the
Dock and repaint what is already there.

| Platform | Does a shipped icon change reach an existing install? |
| --- | --- |
| macOS Safari (Add to Dock) | **No.** Remove from the Dock and add it again. |
| iOS / iPadOS home screen | **No.** Delete the icon and re-add from Share → Add to Home Screen. |
| Android Chrome | Eventually — Chrome re-mints the WebAPK, usually within a few days of use. |
| Desktop Chrome / Edge | Usually, on a later launch. Reinstalling forces it. |

There is no web API that changes an installed icon, on any platform. Anyone
saying otherwise is describing the icon the *page* renders, not the one in the
Dock.

What we can control is whether the platforms that *do* refresh actually notice.
They compare icon URLs, not bytes — so replacing the artwork at the same path
looks like no change at all and Android will keep the old WebAPK. Bump
`ICON_VERSION` in `src/lib/pwa/icon-version.ts` whenever the artwork changes;
it is appended as `?v=` to every manifest and `<link rel="icon">` entry, which
is what makes the change visible to them.

**When rebranding, tell users to re-add the app.** For anyone on macOS or iOS
that is the only way they will ever see the new icon.

## The case that needs handling: an app that is never closed

Nobody quits apps on a phone. A page opened in March is still running the
March JavaScript in June unless something makes it reload — and after a deploy
its lazily-loaded chunks may not exist on the server any more.

`RegisterServiceWorker` handles this:

1. Asks the browser to check for a new worker on load, whenever the app becomes
   visible, and every 30 minutes.
2. When a new worker takes control, waits for a moment that costs the user
   nothing — **the app being backgrounded** — and reloads then. The user comes
   back to the new version and never sees a refresh.
3. If the app is never backgrounded (a desktop tab left open all afternoon),
   offers a "Reload" toast after 90 seconds instead. Declining is not
   declining the update; it still reloads on the next background.

The reload deliberately never fires while the user is looking at the screen.
This is a CRM: the text on screen is often a note being typed during a call,
and losing it is worse than running a version behind for another hour.

Thresholds live in `src/lib/pwa/update-policy.ts`.

## Two things that will break this if changed carelessly

**`public/sw.js` must never be served from cache.** It is the file that
notices new versions, so a cached copy freezes every installed app on whatever
shipped when it was cached — and the app keeps working, which is what makes it
hard to notice. `next.config.ts` sets `Cache-Control: no-cache, no-store,
must-revalidate` on it. Do not remove that, and check it survives any CDN or
proxy placed in front of the app.

**`CACHE_NAME` in `public/sw.js` should be bumped when a cached shell asset
changes.** Because fetches are network-first this is not strictly required —
a stale icon refreshes on the next successful fetch — but bumping it discards
the old cache immediately rather than leaving a retired asset as the offline
fallback until then.

## Verifying after a deploy

1. Open the installed app, background it, reopen it. It should be on the new
   version.
2. DevTools → Application → Service Workers: the active worker's `CACHE_NAME`
   should match what is in the repo.
3. `curl -I https://<host>/sw.js` and confirm the `Cache-Control` header is
   present and not overridden by a CDN.

## What this does not cover

Push notifications, background sync, and anything requiring native APIs. Those
need a real store app — see the notes on the Play Store (TWA) and App Store
tracks before assuming a PWA can do them.
