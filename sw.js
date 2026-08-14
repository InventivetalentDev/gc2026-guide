/* gamescom 2026 guide — service worker.

   Purpose is a show-floor one: Koelnmesse halls have famously bad mobile
   reception, so the guide has to open and stay usable with no network. The
   shell and the data are both cached; the data is refreshed from the network
   whenever there is one.

   Three strategies, picked per request type:

   - navigations      network-first with a short timeout, falling back to the
                      cached shell. A fresh deploy wins when online; a dead
                      connection still opens the app.
   - data/*.json      network-first, falling back to the last good copy. Stale
                      exhibitor data beats an error page.
   - css/js           stale-while-revalidate. Serves instantly and self-heals
                      on the next load, so a deploy that only touches the CSS
                      still lands without bumping anything here.
   - fonts/, icons/   cache-first. They only ever change by filename.
*/

const VERSION = "v1";
const SHELL_CACHE = `gc2026-shell-${VERSION}`;
const DATA_CACHE = `gc2026-data-${VERSION}`;
const NAV_TIMEOUT = 4000;

/* Enough to boot the app and render a full page offline. The latin-ext font
   subsets are left to runtime caching — most visitors never request them. */
const SHELL = [
  "./",
  "map.html",
  "css/fonts.css",
  "css/style.css",
  "css/map.css",
  "js/marks.js",
  "js/app.js",
  "js/map.js",
  "js/qr.js",
  "js/pwa.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "fonts/anton-latin.woff2",
  "fonts/archivo-latin.woff2",
  "fonts/archivo-narrow-latin.woff2",
  "fonts/jetbrains-mono-latin.woff2",
];

/* The hall plans are ~23 KB gzipped for all seven levels — less than one
   font — so they are precached rather than fetched on demand. The point
   of the map is standing in a hall with no reception, and a hall you
   never happened to open before losing signal is exactly the one you
   need. */
const DATA = [
  "data/exhibitors.json",
  "data/event.json",
  "data/meta.json",
  "data/changelog.json",
  "data/hallplan/index.json",
  "data/hallplan/hall-5.2.json",
  "data/hallplan/hall-6.1.json",
  "data/hallplan/hall-7.1.json",
  "data/hallplan/hall-8.1.json",
  "data/hallplan/hall-9.1.json",
  "data/hallplan/hall-10.1.json",
  "data/hallplan/hall-10.2.json",
];

/* cache.add() would otherwise be answered by the browser's own HTTP cache,
   which is where the previous version of every file still lives — the install
   would faithfully copy the bytes it exists to replace. "no-cache" revalidates
   instead of blindly refetching, so the fonts (which only ever change by
   filename) cost a 304 each rather than a fresh megabyte on every update.

   Overwriting in place like this is also why VERSION does not need bumping to
   recover from a poisoned cache: every entry is rewritten on install, and an
   entry whose fetch fails keeps the copy it had, which a bump would delete. */
const fresh = (url) => new Request(url, { cache: "no-cache" });

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      /* addAll is all-or-nothing; one 404 would leave the install with no
         cache at all, so each entry is allowed to fail on its own. */
      await Promise.all(SHELL.map((url) => shell.add(fresh(url)).catch(() => {})));
      const data = await caches.open(DATA_CACHE);
      await Promise.all(DATA.map((url) => data.add(fresh(url)).catch(() => {})));
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, DATA_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

/* The page asks for this once the user accepts the "new version" prompt. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

/* The app cache-busts its JSON with ?v=<timestamp>, which would otherwise
   write a new cache entry on every load and never hit on the way back. Cache
   keys drop the query so there is exactly one entry per file. */
function cacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  return url.href;
}

async function fromNetworkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(cacheKey(request), response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey(request));
    if (cached) return cached;
    throw err;
  }
}

async function fromCacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/* Two things here are load-bearing, and this went out without either:

   event.waitUntil() — respondWith() resolves the instant the cached copy is
   handed over, and the worker may be killed the moment it does. A bare
   fire-and-forget fetch loses that race far more often than it wins, so the
   revalidation half of "stale-while-revalidate" would mostly never happen and
   a deployed CSS/JS change could sit unseen indefinitely. waitUntil keeps the
   worker alive until the put lands.

   cache: "no-cache" — the revalidation must reach the server. Give the host any
   max-age at all and a plain fetch() is answered by the HTTP cache, rewriting
   the same stale bytes back into the SW cache. This forces a conditional
   request instead; an unchanged file costs one 304. */
function staleWhileRevalidate(event, cacheName) {
  const { request } = event;

  const network = fetch(new Request(request, { cache: "no-cache" }))
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  /* Called synchronously while the fetch event is still active — deferring it
     behind an await is what silently makes it a no-op. */
  event.waitUntil(network);

  return (async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await network;
    if (response) return response;
    throw new Error("offline and not cached");
  })();
}

/* Two pages now, so a navigation has to fall back to the one that was
   asked for: everything used to land on "./", which would answer an
   offline request for the hall map with the guide. */
const pageKey = (url) => (url.pathname.endsWith("/map.html") ? "map.html" : "./");

/* Race the network against the clock: on a hall's worth of contended 4G an
   unanswered request should not hold the splash for 30s when a perfectly
   good copy of the shell is on disk. */
async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  const key = pageKey(new URL(request.url));
  try {
    const response = await Promise.race([
      /* network-first is only meaningful if it reaches the network, and the
         HTTP cache will happily answer for index.html. A 304 keeps this
         cheap. */
      fetch(new Request(request, { cache: "no-cache" })),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), NAV_TIMEOUT)),
    ]);
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch (err) {
    const cached =
      (await cache.match(key)) ||
      (key === "./" ? await cache.match("index.html") : await cache.match("./"));
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.includes("/data/")) {
    event.respondWith(fromNetworkFirst(request, DATA_CACHE));
    return;
  }
  if (url.pathname.includes("/fonts/") || url.pathname.includes("/icons/")) {
    event.respondWith(fromCacheFirst(request, SHELL_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
});
