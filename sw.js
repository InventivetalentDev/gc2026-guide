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
  "css/fonts.css",
  "css/style.css",
  "js/app.js",
  "js/pwa.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "fonts/anton-latin.woff2",
  "fonts/archivo-latin.woff2",
  "fonts/archivo-narrow-latin.woff2",
  "fonts/jetbrains-mono-latin.woff2",
];

const DATA = [
  "data/exhibitors.json",
  "data/event.json",
  "data/meta.json",
  "data/changelog.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      /* addAll is all-or-nothing; one 404 would leave the install with no
         cache at all, so each entry is allowed to fail on its own. */
      await Promise.all(SHELL.map((url) => shell.add(url).catch(() => {})));
      const data = await caches.open(DATA_CACHE);
      await Promise.all(DATA.map((url) => data.add(url).catch(() => {})));
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

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const response = await network;
  if (response) return response;
  throw new Error("offline and not cached");
}

/* Race the network against the clock: on a hall's worth of contended 4G an
   unanswered request should not hold the splash for 30s when a perfectly
   good copy of the shell is on disk. */
async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), NAV_TIMEOUT)),
    ]);
    if (response.ok) cache.put("./", response.clone());
    return response;
  } catch (err) {
    const cached = (await cache.match("./")) || (await cache.match("index.html"));
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
  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});
