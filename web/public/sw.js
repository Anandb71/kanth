// Kanth service worker: keeps the app shell and fonts available offline.
// Spoken phrases are cached separately in IndexedDB by the app.
const CACHE = "kanth-shell-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/icon.svg", "/manifest.webmanifest"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws")) return;
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/cache/")) {
    // Hashed build assets and pre-generated audio never change: cache first.
    event.respondWith(
      caches.match(event.request).then(
        (hit) => hit || fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
          return res;
        }),
      ),
    );
    return;
  }
  // Pages: network first, cached copy when offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request.mode === "navigate" ? "/" : event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request.mode === "navigate" ? "/" : event.request).then((hit) => hit || Response.error())),
  );
});
