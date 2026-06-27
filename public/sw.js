/*
 * PathForge service worker (M10). Conservative + privacy-safe:
 *  - Navigations are NETWORK-FIRST and are NOT cached — authenticated HTML never lands
 *    in the cache (no cross-user offline leak on a shared device); pages never go stale.
 *    Offline navigation falls back to the static /offline page (and always returns a
 *    Response, even if that page isn't cached, so the browser error page never shows).
 *  - ONLY provably-immutable, content-hashed assets are cached (cache-first): the
 *    /_next/static/ tree + the precached icon. Non-hashed top-level files (favicon,
 *    manifest, future public/ assets) are left to the network so they can't pin stale.
 *  - /api, POST/mutations, and cross-origin requests are never intercepted.
 *  - A versioned cache + skipWaiting/clients.claim means a deploy cleanly replaces it.
 */
const VERSION = "pf-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // allSettled: a transient failure on one entry must not abort the whole install
      // (which would strand users on the previous worker).
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first ONLY for content-hashed assets — never for stable, mutable URLs.
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname === "/icons/icon.svg";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never touch mutations
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // same-origin only
  if (url.pathname.startsWith("/api/")) return; // never cache API/auth/data

  // Navigations: network-first, fall back to the offline page. Never cached (privacy).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ||
          new Response("You are offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  // Immutable hashed assets: cache-first, then populate the cache.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});
